"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getAllMunicipalities,
  getAllRegions,
  getBarangaysByMunicipality,
  getMunicipalitiesByProvince,
  getProvincesByRegion,
  type PHMunicipality,
} from "@aivangogh/ph-address";

const selectClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const labelClass = "block text-sm font-medium text-slate-700";
const requiredMark = <span className="text-red-600"> *</span>;

/**
 * A Highly Urbanized/Independent City (Cebu City, Davao City, Baguio City,
 * etc. — 17 nationwide) is modeled by the PSGC data as its own self-
 * contained node: its `provinceCode` equals its own `psgcCode`, rather than
 * pointing at its namesake province (Cebu City is legally independent of
 * Cebu province). `getProvincesByRegion` and `getMunicipalitiesByProvince`
 * for the real province therefore never surface it — it has to be offered
 * as a peer of "Province" in the second-level select, the way BIR/PSA forms
 * conventionally present a combined "Province / HUC" dropdown.
 */
function isIndependentCity(m: PHMunicipality): boolean {
  return m.provinceCode === m.psgcCode;
}

function independentCitiesInRegion(regionCode: string): PHMunicipality[] {
  const prefix = regionCode.slice(0, 2);
  return getAllMunicipalities().filter((m) => isIndependentCity(m) && m.psgcCode.startsWith(prefix));
}

/**
 * Manila City alone (of every city/municipality nationwide) has a further
 * layer between city and barangay: 14 administrative districts (Binondo,
 * Ermita, Intramuros, …) that barangays actually attach to — Manila's own
 * code has zero directly-attached barangays. `getMunicipalitiesByProvince`
 * happens to return exactly this: `[]` for an ordinary city/municipality,
 * a same-code singleton for an independent city (already handled above),
 * or Manila's 14 real district children. No other city triggers the third
 * branch, so this stays a general "does this code have a district layer"
 * check rather than a Manila-specific special case.
 */
function districtsOf(municipalityCode: string): PHMunicipality[] {
  return getMunicipalitiesByProvince(municipalityCode).filter((m) => m.psgcCode !== municipalityCode);
}

/**
 * Region → Province (or Independent City) → City/Municipality → Barangay
 * cascade, backed by @aivangogh/ph-address (the official PSA PSGC
 * hierarchy, bundled with the package rather than fetched at runtime).
 * Composes the selections plus a free-text street/unit line into one
 * address string via `onChange` — the `clients`/`contacts` tables still
 * store a single `address` text column, so a parent form mirrors that
 * string into a hidden `name="address"` input rather than this component
 * owning any form field directly.
 *
 * Three region shapes this has to handle:
 * - Ordinary region (e.g. Region I): real provinces only.
 * - NCR: no province level at all — `getProvincesByRegion` returns `[]`,
 *   and the region code doubles as the "province" key
 *   `getMunicipalitiesByProvince` expects.
 * - A region with both real provinces AND independent cities (e.g. Region
 *   VII has Bohol/Cebu provinces *and* Cebu City/Mandaue City/Lapu-Lapu
 *   City as independent cities) — the second-level select offers both as
 *   peers; picking an independent city skips the City/Municipality select
 *   entirely, since there is exactly one valid choice (itself).
 */
export function PhAddressCascade({
  onChange,
  required = false,
}: {
  onChange: (address: string) => void;
  required?: boolean;
}) {
  const regions = useMemo(() => getAllRegions(), []);
  const [regionCode, setRegionCode] = useState("");
  const [secondLevelCode, setSecondLevelCode] = useState("");
  const [municipalityCode, setMunicipalityCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [streetDetail, setStreetDetail] = useState("");

  const provinces = useMemo(() => (regionCode ? getProvincesByRegion(regionCode) : []), [regionCode]);
  const independentCities = useMemo(
    () => (regionCode ? independentCitiesInRegion(regionCode) : []),
    [regionCode]
  );
  const hasSecondLevel = provinces.length > 0 || independentCities.length > 0;
  const selectedIsIndependentCity = independentCities.some((c) => c.psgcCode === secondLevelCode);

  // For a plain province, look up its cities. For NCR-style province-less
  // regions, the region code itself works as the "province" key. For an
  // independent city, this returns a singleton array containing itself —
  // no separate City/Municipality choice to make, so that select is hidden.
  const municipalityParentCode = hasSecondLevel ? secondLevelCode || undefined : regionCode || undefined;
  const municipalities = useMemo(
    () => (municipalityParentCode ? getMunicipalitiesByProvince(municipalityParentCode) : []),
    [municipalityParentCode]
  );

  const effectiveMunicipalityCode = selectedIsIndependentCity ? secondLevelCode : municipalityCode;
  const districts = useMemo(
    () => (effectiveMunicipalityCode ? districtsOf(effectiveMunicipalityCode) : []),
    [effectiveMunicipalityCode]
  );
  const hasDistrictLevel = districts.length > 0;
  const barangayParentCode = hasDistrictLevel ? districtCode || undefined : effectiveMunicipalityCode;
  const barangays = useMemo(
    () => (barangayParentCode ? getBarangaysByMunicipality(barangayParentCode) : []),
    [barangayParentCode]
  );

  useEffect(() => {
    const region = regions.find((r) => r.psgcCode === regionCode);
    const province = provinces.find((p) => p.psgcCode === secondLevelCode);
    const independentCity = independentCities.find((c) => c.psgcCode === secondLevelCode);
    const municipality = independentCity ?? municipalities.find((m) => m.psgcCode === effectiveMunicipalityCode);
    const district = districts.find((d) => d.psgcCode === districtCode);
    const barangay = barangays.find((b) => b.psgcCode === barangayCode);
    const parts = [
      streetDetail.trim(),
      barangay ? `Brgy. ${barangay.name}` : "",
      district?.name,
      // Don't repeat the city's name twice when it's also the "province".
      independentCity ? undefined : municipality?.name,
      independentCity?.name ?? province?.name,
      region?.name,
    ].filter((part): part is string => Boolean(part));
    onChange(parts.join(", "));
    // Only the selected codes and the free-text line should re-run this —
    // everything else is derived fresh each render and would otherwise loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetDetail, regionCode, secondLevelCode, effectiveMunicipalityCode, districtCode, barangayCode]);

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Street / Unit / Building (optional)</label>
        <input
          className={selectClass}
          value={streetDetail}
          onChange={(e) => setStreetDetail(e.target.value)}
          placeholder="Unit 4B, 123 Sample St."
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Region{required && requiredMark}</label>
          <select
            className={selectClass}
            required={required}
            value={regionCode}
            onChange={(e) => {
              setRegionCode(e.target.value);
              setSecondLevelCode("");
              setMunicipalityCode("");
              setDistrictCode("");
              setBarangayCode("");
            }}
          >
            <option value="">Select region…</option>
            {regions.map((r) => (
              <option key={r.psgcCode} value={r.psgcCode}>
                {r.name}
                {r.designation ? ` (${r.designation})` : ""}
              </option>
            ))}
          </select>
        </div>
        {hasSecondLevel && (
          <div>
            <label className={labelClass}>Province / HUC{required && requiredMark}</label>
            <select
              className={selectClass}
              required={required}
              disabled={!regionCode}
              value={secondLevelCode}
              onChange={(e) => {
                setSecondLevelCode(e.target.value);
                setMunicipalityCode("");
                setDistrictCode("");
                setBarangayCode("");
              }}
            >
              <option value="">Select province or independent city…</option>
              {provinces.map((p) => (
                <option key={p.psgcCode} value={p.psgcCode}>
                  {p.name}
                </option>
              ))}
              {independentCities.map((c) => (
                <option key={c.psgcCode} value={c.psgcCode}>
                  {c.name} (Independent City)
                </option>
              ))}
            </select>
          </div>
        )}
        {!selectedIsIndependentCity && (
          <div>
            <label className={labelClass}>City / Municipality{required && requiredMark}</label>
            <select
              className={selectClass}
              required={required}
              disabled={!municipalityParentCode}
              value={municipalityCode}
              onChange={(e) => {
                setMunicipalityCode(e.target.value);
                setDistrictCode("");
                setBarangayCode("");
              }}
            >
              <option value="">Select city/municipality…</option>
              {municipalities.map((m) => (
                <option key={m.psgcCode} value={m.psgcCode}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {hasDistrictLevel && (
          <div>
            <label className={labelClass}>District{required && requiredMark}</label>
            <select
              className={selectClass}
              required={required}
              value={districtCode}
              onChange={(e) => {
                setDistrictCode(e.target.value);
                setBarangayCode("");
              }}
            >
              <option value="">Select district…</option>
              {districts.map((d) => (
                <option key={d.psgcCode} value={d.psgcCode}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass}>Barangay{required && requiredMark}</label>
          <select
            className={selectClass}
            required={required}
            disabled={!barangayParentCode}
            value={barangayCode}
            onChange={(e) => setBarangayCode(e.target.value)}
          >
            <option value="">Select barangay…</option>
            {barangays.map((b) => (
              <option key={b.psgcCode} value={b.psgcCode}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
