## Symptom

TIFF attachments (`.tif` and `.tiff`) upload to wafer/die notes but do not render in the inline image gallery.

## Expected behavior

TIFF note attachments should show a usable inline preview, while opening the attachment should preserve access to the original file.

## Diagnosis

The notes component recognizes TIFF as an image and requests a signed storage URL, but passes that URL directly to the browser image element. Browsers used for WaferWatch do not reliably decode TIFF. Upload, storage MIME policy, attachment registration, and signed URL generation are functioning as designed.

## Plan

- Decode TIFF attachments in the browser and render their first page as a PNG preview.
- Keep the original signed URL for opening/downloading the source TIFF.
- Add regression coverage for TIFF detection and conversion.
- Verify lint, production build, and the Notes route in a browser.

## Verification

- A `.tif` attachment produces a visible PNG preview rather than a broken image.
- PNG/JPEG note previews remain unchanged.
- `npm run lint` and `npm run build` pass.

## Status

Fixed. TIFF note attachments now decode their first page into a temporary PNG object URL for inline display. The original signed TIFF URL is still used when opening the attachment.

Verified with the focused TIFF regression test, `npm run lint`, `npm run build`, and the Wafer Status route at `http://localhost:3015/wireframe/wafer-status?processId=11111111-1111-4111-8111-111111111103`. The browser session had no accessible wafer data, so the stored-attachment click path remained data-gated; the route rendered without console errors.
