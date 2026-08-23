// SVG is left out on purpose: it can carry a script, and an item image ends up
// on everyone's screen in a shared room.
const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Anything the user typed can land here, so a URL that does not parse is just
// a no rather than an exception for the form to catch.
export function isAllowedImageUrl(text: string): boolean {
  let url;
  try {
    url = new URL(text);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  // Read off the path, not the whole string, or a photo.jpg?size=200 loses its
  // extension to the query and a tracking parameter ending in .png gains one.
  const extension = /\.([a-z0-9]+)$/i.exec(url.pathname)?.[1];
  return extension !== undefined && allowedExtensions.includes(extension.toLowerCase());
}
