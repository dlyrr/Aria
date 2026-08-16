//! Online music services — Deezer and Apple Music.
//!
//! Aria plays files off your disk; these services are how you hear something
//! that isn't on the disk yet. Both publish a keyless search API, and both hand
//! back a **30-second preview** for each result. That preview is the whole of
//! what can be played here: full-catalogue playback needs a commercial licence
//! and a DRM module (Widevine, FairPlay) that WebView2 has no way to decrypt,
//! so it isn't attempted and isn't pretended at. Every result therefore carries
//! a `page` link, which is the honest route to the rest of the track.
//!
//! Previews are pulled down to the app cache directory rather than pointed at
//! the `<audio>` element directly. The CDNs' CORS headers aren't ours to rely
//! on, and the element runs behind a `crossOrigin` analyser that a missing
//! header would break outright; a local file sidesteps that and makes seeking
//! and a second listen free.

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// One playable search result, normalized across services.
#[derive(Serialize, Clone)]
pub struct StreamTrack {
    pub id: String,
    /// Which service it came from — `deezer` or `apple`.
    pub service: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Length of the whole track, for display. 0 when the service omits it.
    pub duration: f64,
    /// Length of what actually plays. Both services cut previews at 30s; the
    /// real figure replaces this once the audio element reads the file.
    pub preview_duration: f64,
    pub art: Option<String>,
    /// The preview audio URL.
    pub stream: String,
    /// The track's page on the service, for hearing it in full.
    pub page: Option<String>,
}

/// Previews are cut to 30s by both services.
const PREVIEW_SECONDS: f64 = 30.0;

fn text(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Search one service. `service` is `deezer` or `apple`.
#[tauri::command]
pub async fn stream_search(
    service: String,
    query: String,
    limit: u32,
) -> Result<Vec<StreamTrack>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 50);
    let client = reqwest::Client::new();
    match service.as_str() {
        "deezer" => deezer_search(&client, query, limit).await,
        "apple" => apple_search(&client, query, limit).await,
        other => Err(format!("Unknown service '{other}'.")),
    }
}

async fn deezer_search(
    client: &reqwest::Client,
    query: &str,
    limit: u32,
) -> Result<Vec<StreamTrack>, String> {
    let limit = limit.to_string();
    let body: serde_json::Value = client
        .get("https://api.deezer.com/search")
        .query(&[("q", query), ("limit", limit.as_str())])
        .send()
        .await
        .map_err(|e| format!("Deezer is unreachable ({e})."))?
        .json()
        .await
        .map_err(|e| format!("Deezer sent something unreadable ({e})."))?;

    // Deezer reports quota and parameter problems inside a 200 response.
    if let Some(error) = body.get("error").filter(|e| !e.is_null()) {
        let message = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("request refused");
        return Err(format!("Deezer: {message}"));
    }

    let items = body
        .get("data")
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items
        .iter()
        .filter_map(|item| {
            // A result without a preview can't be played, so it isn't offered.
            let stream = item
                .get("preview")
                .and_then(|p| p.as_str())
                .filter(|s| !s.is_empty())?
                .to_string();
            let album = item.get("album");
            Some(StreamTrack {
                id: item
                    .get("id")
                    .map(|id| id.to_string())
                    .unwrap_or_default(),
                service: "deezer".into(),
                title: text(item, "title"),
                artist: item.get("artist").map(|a| text(a, "name")).unwrap_or_default(),
                album: album.map(|a| text(a, "title")).unwrap_or_default(),
                duration: item.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0),
                preview_duration: PREVIEW_SECONDS,
                art: album
                    .and_then(|a| a.get("cover_big"))
                    .and_then(|c| c.as_str())
                    .map(str::to_owned),
                stream,
                page: item.get("link").and_then(|l| l.as_str()).map(str::to_owned),
            })
        })
        .collect())
}

async fn apple_search(
    client: &reqwest::Client,
    query: &str,
    limit: u32,
) -> Result<Vec<StreamTrack>, String> {
    let limit = limit.to_string();
    let body: serde_json::Value = client
        .get("https://itunes.apple.com/search")
        .query(&[
            ("term", query),
            ("media", "music"),
            ("entity", "song"),
            ("limit", limit.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Apple Music is unreachable ({e})."))?
        .json()
        .await
        .map_err(|e| format!("Apple Music sent something unreadable ({e})."))?;

    let items = body
        .get("results")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items
        .iter()
        .filter_map(|item| {
            let stream = item
                .get("previewUrl")
                .and_then(|p| p.as_str())
                .filter(|s| !s.is_empty())?
                .to_string();
            Some(StreamTrack {
                id: item
                    .get("trackId")
                    .map(|id| id.to_string())
                    .unwrap_or_default(),
                service: "apple".into(),
                title: text(item, "trackName"),
                artist: text(item, "artistName"),
                album: text(item, "collectionName"),
                duration: item
                    .get("trackTimeMillis")
                    .and_then(|d| d.as_f64())
                    .map(|ms| ms / 1000.0)
                    .unwrap_or(0.0),
                preview_duration: PREVIEW_SECONDS,
                // The search API only advertises the 100px thumbnail, but the
                // same path serves any size — ask for one worth looking at.
                art: item
                    .get("artworkUrl100")
                    .and_then(|a| a.as_str())
                    .map(|url| url.replace("100x100bb", "600x600bb")),
                stream,
                page: item
                    .get("trackViewUrl")
                    .and_then(|l| l.as_str())
                    .map(str::to_owned),
            })
        })
        .collect())
}

/// A preview URL with its query string dropped.
///
/// Deezer signs previews with an expiry, so the same track comes back under a
/// different URL from every search. The path alone already ends in a content
/// hash, which makes it both a stable cache key and the reason a preview
/// queued an hour ago still plays: it's read from disk rather than re-fetched
/// against a token that has since expired.
fn cache_key(url: &str) -> &str {
    url.split(['?', '#']).next().unwrap_or(url)
}

/// The extension a preview URL implies, for naming its cached copy. Deezer
/// serves MP3 and Apple serves M4A, but neither promises to keep doing so.
fn extension_of(url: &str) -> String {
    let ext = cache_key(url).rsplit('.').next().unwrap_or("");
    if !ext.is_empty() && ext.len() <= 4 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        ext.to_ascii_lowercase()
    } else {
        "mp3".into()
    }
}

/// Fetch a preview into the app cache and return its local path. A preview
/// already on disk is reused, so replaying one costs nothing.
#[tauri::command]
pub async fn cache_stream(app: AppHandle, url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Not a remote stream.".into());
    }

    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("No cache directory ({e})."))?
        .join("streams");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Can't create the cache ({e})."))?;

    let path = dir.join(format!(
        "{:x}.{}",
        md5::compute(cache_key(&url).as_bytes()),
        extension_of(&url)
    ));
    if std::fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(path.to_string_lossy().into_owned());
    }

    let bytes = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Can't reach the preview ({e})."))?
        .error_for_status()
        .map_err(|e| format!("The service refused the preview ({e})."))?
        .bytes()
        .await
        .map_err(|e| format!("The preview download failed ({e})."))?;

    // Written aside and moved into place, so a download interrupted halfway
    // can't leave a truncated file that later runs would happily play.
    let partial = path.with_extension("part");
    std::fs::write(&partial, &bytes).map_err(|e| format!("Can't write the preview ({e})."))?;
    std::fs::rename(&partial, &path).map_err(|e| format!("Can't save the preview ({e})."))?;

    Ok(path.to_string_lossy().into_owned())
}
