import { loadOutlets, withAge } from "./loadData.js";
import { crossTabClassByAge, summarizeAll, summarizeByRegion, summarizeBySalesArea, summarizeByZone } from "./aggregate.js";

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

function main(): void {
  const outlets = withAge(loadOutlets());

  const all = summarizeAll(outlets);
  console.log(`All India: ${all.outletCount} outlets, avg planned MS delta ${pct(all.avgMsDeltaKlpm)} KLPM, avg planned HSD delta ${pct(all.avgHsdDeltaKlpm)} KLPM`);

  console.log("\nZone-wise:");
  for (const z of summarizeByZone(outlets)) {
    console.log(`  ${z.zone.padEnd(32)} outlets=${String(z.outletCount).padStart(4)}  avgMsDelta=${pct(z.avgMsDeltaKlpm).padStart(7)}  avgHsdDelta=${pct(z.avgHsdDeltaKlpm).padStart(7)}`);
  }

  const topZone = summarizeByZone(outlets)[0];
  if (topZone) {
    console.log(`\nRegion-wise within ${topZone.zone}:`);
    for (const r of summarizeByRegion(outlets, topZone.zone)) {
      console.log(`  ${r.region.padEnd(28)} outlets=${String(r.outletCount).padStart(4)}  avgMsDelta=${pct(r.avgMsDeltaKlpm).padStart(7)}`);
    }

    const topRegion = summarizeByRegion(outlets, topZone.zone)[0];
    if (topRegion) {
      console.log(`\nSales-area-wise within ${topRegion.region}:`);
      for (const sa of summarizeBySalesArea(outlets, topRegion.region)) {
        console.log(`  ${sa.salesArea.padEnd(28)} outlets=${String(sa.outletCount).padStart(3)}  avgMsDelta=${pct(sa.avgMsDeltaKlpm).padStart(7)}`);
      }
    }
  }

  console.log("\nNational Class of Market x Age Bracket (avg planned MS delta, KLPM):");
  const crossTab = crossTabClassByAge(outlets);
  for (const [classOfMarket, byAge] of Object.entries(crossTab)) {
    const cells = Object.entries(byAge)
      .map(([bracket, totals]) => `${bracket}=${pct(totals.avgMsDeltaKlpm)}`)
      .join("  ");
    console.log(`  ${classOfMarket.padEnd(14)} ${cells}`);
  }
}

main();
