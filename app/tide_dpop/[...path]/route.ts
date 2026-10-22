import fs from "fs"
import path from "path"

const htmlPath = path.join(process.cwd(), "public", "tide_dpop_auth.html")

const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'sha256-utc6UrebuHOyLd/2aiMXS/p1EDy9UZBDe/XEMKDw9Mc='; " +
  "style-src 'self' 'sha256-1tYy8m3c1KLuGI2eID9TfLkc50Y+iSPJMpI7n/apN/w=' 'sha256-F7OJTdJYct4J+cQfuJUoDauitndqt8pAc8EbA8gwDPU='"

export async function GET(): Promise<Response> {
  const html = fs.readFileSync(htmlPath, "utf-8")
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
      "Content-Security-Policy": CSP,
      "Allow-CSP-From": "*",
    },
  })
}
