import { apiGet } from "./http";

export async function searchApi(q, limit = 20) {
  const path = `/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await apiGet(path, { auth: false });
  if (!res.ok) throw new Error(res.error || "search failed");
  return res.data; // { q, results: [...] }
}
