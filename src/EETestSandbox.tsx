import { useState, useEffect, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerationAsset {
  name: string;
  expectedMW: number;
  actualMW: number;
}

interface CommercialClient {
  name: string;
  type: string;
  contractedMW: number;
}

type ClientDataSource = "live" | "fallback" | "loading";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Google Sheets CSV export config. The sheet must be shared as
// "Anyone with the link can view" (or Published to web) for the live
// fetch to succeed — otherwise Google returns an HTML login redirect
// instead of CSV, which is treated as a fetch failure and triggers the
// fallback path below.
const SHEET_ID = "1o0RmYQy17U_lkp4Pmh84kJMLKB4esBi5gmJTfSzSNFU";
const GID = "0";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const FETCH_TIMEOUT_MS = 5000;

// Imbalance tolerance. Placeholder for a real settlement tolerance —
// in production this would come from the commercial contract terms,
// not a hardcoded constant.
const IMBALANCE_THRESHOLD_RATIO = 0.1; // 10% of expected generation

// Fallback client data — used on first load, and whenever the live
// Google Sheets fetch fails, times out, or returns unparseable content.
const FALLBACK_CLIENTS: CommercialClient[] = [
  { name: "Kestrel Loaf Bakehouse", type: "Bakery", contractedMW: 8.0 },
  { name: "Farrowgate Trust Bank", type: "Bank", contractedMW: 12.5 },
  { name: "Halden Ridge Cold Storage", type: "Warehouse", contractedMW: 14.5 },
  { name: "Marlow Vale Retail Park", type: "Retail", contractedMW: 12.0 },
];

const INITIAL_ASSETS: GenerationAsset[] = [
  { name: "Preston 2 Wind Farm", expectedMW: 25.0, actualMW: 25.0 },
  { name: "Lytham Solar Rays", expectedMW: 21.0, actualMW: 21.0 },
];

// ---------------------------------------------------------------------------
// CSV parsing (minimal — no external dependency, sufficient for the
// simple 3-column sheet this app expects)
// ---------------------------------------------------------------------------

function parseClientCsv(csvText: string): CommercialClient[] {
  const lines = csvText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV has no data rows");
  }

  // Skip header row.
  const rows = lines.slice(1);

  const clients: CommercialClient[] = rows.map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const [name, type, contractedRaw] = cols;
    const contractedMW = parseFloat(contractedRaw.replace(/[^0-9.]/g, ""));

    if (!name || !type || Number.isNaN(contractedMW)) {
      throw new Error(`Malformed row: "${line}"`);
    }

    return { name, type, contractedMW };
  });

  if (clients.length === 0) {
    throw new Error("No valid client rows parsed");
  }

  return clients;
}

async function fetchLiveClients(): Promise<CommercialClient[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(SHEET_CSV_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Sheet fetch failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    // A private/unshared sheet returns an HTML login page, not CSV.
    if (contentType.includes("text/html") || text.trim().startsWith("<")) {
      throw new Error("Sheet is not publicly viewable (got HTML, expected CSV)");
    }

    return parseClientCsv(text);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Derived imbalance logic — pure functions, no knowledge of buttons/UI.
// This is the piece that must NOT be a scripted reaction to a click.
// ---------------------------------------------------------------------------

interface ImbalanceResult {
  totalExpectedMW: number;
  totalActualMW: number;
  imbalanceMW: number;
  isImbalanced: boolean;
}

function computeImbalance(assets: GenerationAsset[]): ImbalanceResult {
  const totalExpectedMW = assets.reduce((sum, a) => sum + a.expectedMW, 0);
  const totalActualMW = assets.reduce((sum, a) => sum + a.actualMW, 0);
  const imbalanceMW = totalActualMW - totalExpectedMW;
  const thresholdMW = totalExpectedMW * IMBALANCE_THRESHOLD_RATIO;
  const isImbalanced = Math.abs(imbalanceMW) > thresholdMW;

  return { totalExpectedMW, totalActualMW, imbalanceMW, isImbalanced };
}

function isAssetFaulted(asset: GenerationAsset): boolean {
  const deviation = Math.abs(asset.actualMW - asset.expectedMW);
  return deviation > asset.expectedMW * IMBALANCE_THRESHOLD_RATIO;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EETestSandbox() {
  const [assets, setAssets] = useState<GenerationAsset[]>(INITIAL_ASSETS);
  const [clients, setClients] = useState<CommercialClient[]>(FALLBACK_CLIENTS);
  const [clientSource, setClientSource] = useState<ClientDataSource>("loading");
  // Which PPA asset the fault simulator currently targets. Defaults to
  // Preston 2 Wind Farm so the existing single-asset demo flow and
  // Playwright tests keep working without any extra selection step.
  const [selectedAsset, setSelectedAsset] = useState<string>("Preston 2 Wind Farm");

  // Live client fetch, with silent fallback. Runs once on mount.
  useEffect(() => {
    let cancelled = false;

    fetchLiveClients()
      .then((liveClients) => {
        if (cancelled) return;
        setClients(liveClients);
        setClientSource("live");
      })
      .catch(() => {
        if (cancelled) return;
        setClients(FALLBACK_CLIENTS);
        setClientSource("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Derived state — recalculated on every render from current asset
  // values. Nothing here is set directly by a button handler.
  const imbalance = useMemo(() => computeImbalance(assets), [assets]);

  const clientSummary = useMemo(() => {
    const totalContractedMW = clients.reduce((sum, c) => sum + c.contractedMW, 0);
    return { count: clients.length, totalContractedMW };
  }, [clients]);

  // Buttons only mutate generation state for whichever asset is
  // currently selected. They never touch the alert, the balance
  // styling, or the banner directly.
  const setActualForAsset = useCallback((assetName: string, mw: number) => {
    setAssets((prev) =>
      prev.map((a) => (a.name === assetName ? { ...a, actualMW: mw } : a))
    );
  }, []);

  const handleTriggerFault = () => {
    const asset = assets.find((a) => a.name === selectedAsset)!;
    setActualForAsset(selectedAsset, asset.expectedMW * 0.08); // heavy shortfall
  };
  const handleTriggerMinor = () => {
    const asset = assets.find((a) => a.name === selectedAsset)!;
    setActualForAsset(selectedAsset, asset.expectedMW * 0.94); // within tolerance
  };
  const handleReset = () => {
    assets.forEach((a) => setActualForAsset(a.name, a.expectedMW));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3.5 text-white">
        <span className="text-[15px] font-medium">
          QA Test <span className="text-slate-500">|</span> Operational Control Sandbox
        </span>
        <span className="flex items-center gap-1.5 rounded bg-green-900/40 px-2.5 py-1 text-xs text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          System Gateways: Active
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {/* METRICS CARDS */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="PPA Source">
            <p className="text-base font-medium">{assets.length} Assets</p>
            <p className="mt-1 text-xs text-green-700">Contracts Active</p>
          </MetricCard>

          <MetricCard label="Commercial Clients">
            <p className="text-base font-medium">{clientSummary.count} Active</p>
            <p className="mt-1 text-xs text-slate-500">
              {clientSummary.totalContractedMW.toFixed(1)} MW Contracted
            </p>
          </MetricCard>

          <MetricCard label="Net Supply Position">
            <p
              data-testid="grid-balance-display"
              className={`text-xl font-medium ${
                imbalance.isImbalanced ? "text-red-600" : "text-green-700"
              }`}
            >
              {imbalance.imbalanceMW >= 0 ? "" : "-"}
              {Math.abs(imbalance.imbalanceMW).toFixed(2)} MW (
              {imbalance.isImbalanced ? "Imbalance Exposure" : "Balanced"})
            </p>
          </MetricCard>
        </div>

        {/* ALERT BANNER — rendered purely from derived state */}
        {imbalance.isImbalanced && (
          <div
            data-testid="imbalance-alert-banner"
            className="mb-5 animate-pulse rounded border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            role="alert"
          >
            CRITICAL ALERT: Supply Position Imbalance Detected - Action Required
          </div>
        )}

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* RENEWABLE TRACKER TABLE */}
          <div className="lg:col-span-2">
            <p className="mb-2 text-xs font-medium text-slate-500">
              PPA Delivery Tracker <span className="font-normal text-slate-400">— click a row to select it</span>
            </p>
            <table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">PPA Asset</th>
                  <th className="px-3 py-2 font-medium">Contracted Volume</th>
                  <th className="px-3 py-2 font-medium">Delivered Volume</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const faulted = isAssetFaulted(asset);
                  const isWind = asset.name === "Preston 2 Wind Farm";
                  const isSelected = asset.name === selectedAsset;
                  const rowTestId = isWind ? "asset-row-wind" : "asset-row-solar";
                  return (
                    <tr
                      key={asset.name}
                      data-testid={rowTestId}
                      onClick={() => setSelectedAsset(asset.name)}
                      className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                        isSelected ? "ring-2 ring-inset ring-blue-500" : ""
                      }`}
                    >
                      <td className="px-3 py-2">{asset.name}</td>
                      <td className="px-3 py-2">{asset.expectedMW.toFixed(1)} MW</td>
                      <td
                        className="px-3 py-2"
                        {...(isWind ? { "data-testid": "wind-farm-actual-gen" } : { "data-testid": "solar-actual-gen" })}
                      >
                        {asset.actualMW.toFixed(1)} MW
                      </td>
                      <td className={`px-3 py-2 ${faulted ? "text-red-600" : "text-green-700"}`}>
                        {faulted ? "Fault" : "Normal"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SANDBOX FAULT SIMULATOR */}
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm font-medium">Sandbox Fault Simulator</p>
            <p data-testid="fault-target-label" className="mb-3 text-xs text-slate-500">
              Target: {selectedAsset}
            </p>
            <button
              type="button"
              data-testid="trigger-fault-btn"
              onClick={handleTriggerFault}
              className="mb-2 w-full rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Trigger PPA Shortfall
            </button>
            <button
              type="button"
              data-testid="trigger-minor-btn"
              onClick={handleTriggerMinor}
              className="mb-2 w-full rounded bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-200"
            >
              Trigger Minor Fluctuation
            </button>
            <button
              type="button"
              data-testid="reset-sandbox-btn"
              onClick={handleReset}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset Sandbox
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Current delivered volume: {assets.find((a) => a.name === selectedAsset)!.actualMW.toFixed(1)} MW
            </p>
          </div>
        </div>

        {/* COMMERCIAL CLIENT PORTFOLIO */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Commercial Client Portfolio</p>
            <span
              data-testid="client-data-source-badge"
              className={`rounded px-2 py-1 text-xs ${
                clientSource === "live"
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {clientSource === "live"
                ? "Live: Google Sheets"
                : clientSource === "loading"
                ? "Loading…"
                : "Offline: Cached Data"}
            </span>
          </div>
          <table data-testid="client-portfolio-table" className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Contracted Supply</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.name} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{client.name}</td>
                  <td className="px-3 py-2 text-slate-500">{client.type}</td>
                  <td className="px-3 py-2">{client.contractedMW.toFixed(1)} MW</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="mb-1.5 text-xs text-slate-500">{label}</p>
      {children}
    </div>
  );
}
