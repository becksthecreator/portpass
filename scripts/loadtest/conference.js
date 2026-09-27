// Conference-readiness load test (k6). About 200 virtual users ramped over
// 10 minutes, walking the journey a WhatsApp/QR visitor takes: homepage ->
// a section -> a business page -> the planner or the registration page.
// GET only -- it never submits a form.
//
// Run it against a PREVIEW deployment that points at a Supabase branch or
// scratch copy, never against portpassbahamas.com. See README.md.
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/$/, "");
if (!BASE_URL) {
  throw new Error("Set BASE_URL to the preview deployment, e.g. https://portpass-git-loadtest-port-pass.vercel.app");
}
if (/portpassbahamas\.com/i.test(BASE_URL)) {
  throw new Error("Refusing to load-test production.");
}

// Vercel "Protection Bypass for Automation" secret, when the preview is
// behind Vercel Authentication. Leave unset for an unprotected preview.
const BYPASS = __ENV.VERCEL_BYPASS || "";

export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "3m", target: 120 },
    { duration: "3m", target: 200 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<1000"],
  },
};

const SECTIONS = ["/sports-fitness", "/weddings", "/entertainment"];
const BUSINESS_PAGES = ["/sports-fitness/futprep-athletics", "/weddings/bahamas-weddings-by-the-sea"];
const ACTION_PAGES = ["/weddings/bahamas-weddings-by-the-sea/plan?tier=pink-sand", "/futprep/register?program=lil-kickers"];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function get(path, name) {
  const headers = {};
  if (BYPASS) {
    headers["x-vercel-protection-bypass"] = BYPASS;
    headers["x-vercel-set-bypass-cookie"] = "true";
  }
  const res = http.get(`${BASE_URL}${path}`, { headers, tags: { name } });
  check(res, { [`${name}: 200`]: (r) => r.status === 200 });
  return res;
}

export default function () {
  group("home", () => {
    get("/", "home");
    sleep(1 + Math.random() * 2);
  });
  group("section", () => {
    get(pick(SECTIONS), "section");
    sleep(1 + Math.random() * 2);
  });
  group("business", () => {
    get(pick(BUSINESS_PAGES), "business");
    sleep(2 + Math.random() * 3);
  });
  group("action page", () => {
    get(pick(ACTION_PAGES), "action");
    sleep(2 + Math.random() * 3);
  });
}
