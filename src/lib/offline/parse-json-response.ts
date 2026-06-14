/** Parse a fetch Response as JSON; surface HTML error pages as readable errors. */
export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      "Server returned a web page instead of data — sign in again or refresh the page.",
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Server returned an invalid response — try again.");
  }
}
