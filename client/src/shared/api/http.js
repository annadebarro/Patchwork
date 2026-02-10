export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function parseApiResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await res.json();
    } catch (err) {
      console.error("Failed to parse JSON response", err);
      return null;
    }
  }

  try {
    const text = await res.text();
    return text ? { message: text } : null;
  } catch (err) {
    console.error("Failed to read response body", err);
    return null;
  }
}
