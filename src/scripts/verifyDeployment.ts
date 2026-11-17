/**
 * STRIDEX - Final Vercel & Render Deployment Verification Script
 * Audits deployed URLs, CORS negotiation, environment configuration, and codebase readiness.
 */
import https from "https";
import http from "http";

const VERCEL_FRONTEND_URL = "https://stridex-shoes.vercel.app";
const RENDER_BACKEND_URL = "https://stridex-backend-mkkz.onrender.com";

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const fetchUrl = (
  url: string,
  method = "GET",
  headers: Record<string, string> = {}
): Promise<HttpResponse> => {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;

    const req = client.request(
      url,
      {
        method,
        headers: {
          "User-Agent": "STRIDEX-Deployment-Verifier/1.0",
          ...headers,
        },
        timeout: 15000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out after 15000ms"));
    });
    req.end();
  });
};

async function runAudit() {
  console.log("=================================================================");
  console.log("🚀 STRIDEX - PRODUCTION DEPLOYMENT & INTEGRATION AUDIT");
  console.log("=================================================================");
  console.log(`Frontend URL: ${VERCEL_FRONTEND_URL}`);
  console.log(`Backend URL:  ${RENDER_BACKEND_URL}`);
  console.log("-----------------------------------------------------------------");

  // 1. Render Backend Health Check
  console.log("\n[1] Testing Live Render Backend API Health Endpoint...");
  try {
    const health = await fetchUrl(`${RENDER_BACKEND_URL}/api/health`);
    console.log(`    Status Code: ${health.statusCode}`);
    if (health.statusCode === 200) {
      console.log(`    ✅ Backend HTTP Server is Online & Responsive!`);
      try {
        const json = JSON.parse(health.body);
        console.log(`    Response Body:`, JSON.stringify(json, null, 2));
      } catch {
        console.log(`    Raw Response: ${health.body.slice(0, 100)}`);
      }
    } else {
      console.log(`    ⚠️  Unexpected status code: ${health.statusCode}`);
    }
  } catch (err: any) {
    console.log(`    ❌ Backend request failed: ${err.message}`);
  }

  // 2. Render Products Query / Database Connectivity Check
  console.log("\n[2] Testing Live Render Database Route (/api/v1/products)...");
  try {
    const productsRes = await fetchUrl(`${RENDER_BACKEND_URL}/api/v1/products?limit=1`);
    console.log(`    Status Code: ${productsRes.statusCode}`);
    if (productsRes.statusCode === 200) {
      console.log(`    ✅ MongoDB Atlas is connected and returning product data!`);
    } else if (productsRes.statusCode === 500) {
      console.log(`    ⚠️  MongoDB Atlas Connection Issue: ${productsRes.body}`);
      console.log(`    👉 Render Web Service requires MONGODB_URI in Environment Variables`);
    } else {
      console.log(`    Response: ${productsRes.body.slice(0, 150)}`);
    }
  } catch (err: any) {
    console.log(`    ⚠️  Products request failed/timed out: ${err.message}`);
  }

  // 3. CORS Preflight & Origin Negotiation
  console.log("\n[3] Testing CORS Policy for Vercel Frontend Origin...");
  try {
    const corsRes = await fetchUrl(
      `${RENDER_BACKEND_URL}/api/health`,
      "GET",
      {
        Origin: VERCEL_FRONTEND_URL,
      }
    );
    const allowOrigin = corsRes.headers["access-control-allow-origin"];
    const allowCreds = corsRes.headers["access-control-allow-credentials"];
    console.log(`    access-control-allow-origin:      ${allowOrigin || "NONE"}`);
    console.log(`    access-control-allow-credentials: ${allowCreds || "NONE"}`);
  } catch (err: any) {
    console.log(`    ⚠️  CORS test error: ${err.message}`);
  }

  // 4. Vercel Frontend Root Page
  console.log("\n[4] Testing Live Vercel Frontend Root (/) ...");
  try {
    const frontendRes = await fetchUrl(VERCEL_FRONTEND_URL);
    console.log(`    Status Code: ${frontendRes.statusCode}`);
    if (frontendRes.statusCode === 200) {
      console.log(`    ✅ Vercel Frontend is Online and Serving HTML!`);
      const hasTitle = frontendRes.body.includes("<title>STRIDEX");
      console.log(`    STRIDEX Document Title Present: ${hasTitle ? "YES" : "NO"}`);
    } else {
      console.log(`    ⚠️  Unexpected status code: ${frontendRes.statusCode}`);
    }
  } catch (err: any) {
    console.log(`    ❌ Frontend request failed: ${err.message}`);
  }

  // 5. Vercel SPA Direct Routing Test
  console.log("\n[5] Testing Vercel SPA Direct Deep Link (/shop)...");
  try {
    const shopRes = await fetchUrl(`${VERCEL_FRONTEND_URL}/shop`);
    console.log(`    Status Code: ${shopRes.statusCode}`);
    if (shopRes.statusCode === 200) {
      console.log(`    ✅ SPA Routing works!`);
    } else if (shopRes.statusCode === 404) {
      console.log(`    ⚠️  404 Not Found on Deep Link!`);
      console.log(`    👉 Needs vercel.json rewrite to route SPA requests to index.html`);
    }
  } catch (err: any) {
    console.log(`    ⚠️  SPA test failed: ${err.message}`);
  }

  console.log("\n=================================================================");
  console.log("🏁 VERIFICATION SCRIPT COMPLETE");
  console.log("=================================================================");
}

runAudit();
