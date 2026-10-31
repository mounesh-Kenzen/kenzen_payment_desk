const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const EXT_MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export function fileMime(f) {
  return ALLOWED.includes(f.type) ? f.type : EXT_MIME[(f.name.split(".").pop() || "").toLowerCase()] || f.type;
}

async function initUpload(name, mime, size) {
  const res = await fetch("/api/upload", {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify({ step: "init", name, mime, size }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't start the upload.");
  return data.uploadUrl;
}

async function finalizeUpload(fileId) {
  const res = await fetch("/api/upload", {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" },
    body: JSON.stringify({ step: "finalize", fileId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't finish the upload.");
  return data;
}

// Uploads straight from the browser to Google Drive using a resumable session
// URI our server requests on our behalf (service account) so files up to the
// 10MB limit never have to pass through our serverless function's ~4.5MB
// request body cap.
export async function uploadAttachment(file, onProgress) {
  const mime = fileMime(file);
  if (!ALLOWED.includes(mime)) throw new Error(file.name + ": attach a PDF, PNG, JPG or WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error(file.name + " is over 10 MB. Compress it and try again.");

  const uploadUrl = await initUpload(file.name, mime, file.size);

  const driveFile = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", mime);
    if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Drive returned an unexpected response.")); }
      } else reject(new Error("Upload failed (" + xhr.status + ")."));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });

  return finalizeUpload(driveFile.id);
}
