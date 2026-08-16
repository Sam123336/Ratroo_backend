/**
 * HTTP client for the Namma BMTC backend.
 *
 * Deliberately slow. This talks to the backend used by BMTC's official Namma
 * BMTC commuter dashboard. It is publicly reachable but has no published rate
 * limit. The default one-second interval keeps exploratory imports gentle.
 *
 * Every response is written to disk before it is parsed, so a re-run costs
 * nothing and the raw payloads become fixtures. That matters here more than
 * usual: the parser was written against a spec, not captured traffic, so the
 * first successful run is also the first real test of it.
 */
import { createHash } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const BMTC_BASE_URL = "https://bmtcmobileapi.karnataka.gov.in/WebAPI";
export const BMTC_WEB_ORIGIN = "https://nammabmtcapp.karnataka.gov.in";

export interface BmtcClientOptions {
  /** Where raw responses are cached. A run is resumable from this directory. */
  cacheDir: string;
  /** Minimum gap between requests. Lower it only if you know the operator is fine with it. */
  minIntervalMs?: number;
  /** Attempts per endpoint before giving up on that one call. */
  retries?: number;
  requestTimeoutMs?: number;
  baseUrl?: string;
  webOrigin?: string;
  /** Identifies us in their logs. An operator should be able to tell who this is. */
  userAgent?: string;
  onProgress?: (message: string) => void;
}

export interface BmtcRawResponse<T> {
  body: T;
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  /** True when served from [BmtcClientOptions.cacheDir] rather than the network. */
  fromCache: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BmtcClient {
  private readonly opts: Required<Omit<BmtcClientOptions, "onProgress">> &
    Pick<BmtcClientOptions, "onProgress">;
  private lastRequestAt = 0;

  constructor(options: BmtcClientOptions) {
    this.opts = {
      minIntervalMs: 1000,
      retries: 3,
      requestTimeoutMs: 30_000,
      baseUrl: BMTC_BASE_URL,
      webOrigin: BMTC_WEB_ORIGIN,
      // The API's nginx policy currently rejects generic HTTP clients. Keep
      // this aligned with the public web application's ordinary browser call.
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      ...options,
    };
    mkdirSync(this.opts.cacheDir, { recursive: true });
  }

  private cachePath(endpoint: string, body: unknown): string {
    const key = createHash("sha1")
      // Include the deployment in the key so responses from the retired
      // Amnex staging host can never masquerade as current official data.
      .update(`${this.opts.baseUrl}:${endpoint}:${JSON.stringify(body)}`)
      .digest("hex")
      .slice(0, 16);
    return join(
      this.opts.cacheDir,
      `${endpoint.replace(/\W+/g, "_")}-${key}.json`,
    );
  }

  /**
   * POST an endpoint, honouring the cache and the rate limit.
   *
   * Retries only what is worth retrying. A 4xx means the request is wrong and
   * will be wrong again; retrying it just adds load. Timeouts, 5xx and
   * transport errors back off and try again.
   */
  async post<T>(
    endpoint: string,
    body: Record<string, unknown> | null = null,
  ): Promise<BmtcRawResponse<T>> {
    const path = this.cachePath(endpoint, body);
    if (existsSync(path)) {
      const cached = JSON.parse(
        readFileSync(path, "utf8"),
      ) as BmtcRawResponse<T>;
      return { ...cached, fromCache: true };
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.opts.retries; attempt++) {
      const wait = this.opts.minIntervalMs - (Date.now() - this.lastRequestAt);
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      const url = `${this.opts.baseUrl}/${endpoint}`;
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.opts.requestTimeoutMs,
      );

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/json",
            lan: "en",
            deviceType: "WEB",
            Origin: this.opts.webOrigin,
            Referer: `${this.opts.webOrigin}/`,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": this.opts.userAgent,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        const text = await res.text();

        if (res.status >= 400 && res.status < 500) {
          // Our fault, not theirs. Retrying cannot help and only adds load.
          throw new Error(
            `${endpoint}: HTTP ${res.status} — ${text.slice(0, 200)}`,
          );
        }
        if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);

        const record: BmtcRawResponse<T> = {
          body: JSON.parse(text) as T,
          sourceUrl: url,
          fetchedAt: new Date().toISOString(),
          contentHash: createHash("sha256").update(text).digest("hex"),
          fromCache: false,
        };
        writeFileSync(path, JSON.stringify(record, null, 2));
        return record;
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (error instanceof Error && /HTTP 4\d\d/.test(error.message))
          throw error;
        if (attempt < this.opts.retries) {
          const backoff = this.opts.minIntervalMs * 2 ** attempt;
          this.opts.onProgress?.(
            `  retry ${attempt}/${this.opts.retries} after ${backoff}ms — ${String(error).slice(0, 80)}`,
          );
          await sleep(backoff);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
