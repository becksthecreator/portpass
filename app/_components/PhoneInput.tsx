"use client";

import { useEffect, useState } from "react";

// An international phone field (round 5, §7): a country-code picker with
// The Bahamas first and selected by default, and a national-number box.
// The value in and out is E.164 ("+12424238161"), which is what every
// server route and WhatsApp link expects; an empty number is "". Legacy
// free-text values ("242-423-8161") are read Bahamas-first, the same way
// lib/phone.ts normalises them.
type Country = { code: string; name: string; dial: string; national: number | null; placeholder?: string };

export const PHONE_COUNTRIES: Country[] = [
  { code: "BS", name: "Bahamas", dial: "1242", national: 7, placeholder: "423-8161" },
  { code: "US", name: "United States / Canada", dial: "1", national: 10, placeholder: "212 555 0100" },
  { code: "AG", name: "Antigua & Barbuda", dial: "1268", national: 7 },
  { code: "BB", name: "Barbados", dial: "1246", national: 7 },
  { code: "BM", name: "Bermuda", dial: "1441", national: 7 },
  { code: "KY", name: "Cayman Islands", dial: "1345", national: 7 },
  { code: "DO", name: "Dominican Republic", dial: "1809", national: 7 },
  { code: "JM", name: "Jamaica", dial: "1876", national: 7 },
  { code: "PR", name: "Puerto Rico", dial: "1787", national: 7 },
  { code: "TT", name: "Trinidad & Tobago", dial: "1868", national: 7 },
  { code: "TC", name: "Turks & Caicos", dial: "1649", national: 7 },
  { code: "VG", name: "British Virgin Islands", dial: "1284", national: 7 },
  { code: "VI", name: "US Virgin Islands", dial: "1340", national: 7 },
  { code: "AR", name: "Argentina", dial: "54", national: null },
  { code: "AU", name: "Australia", dial: "61", national: null },
  { code: "BR", name: "Brazil", dial: "55", national: null },
  { code: "CN", name: "China", dial: "86", national: null },
  { code: "CO", name: "Colombia", dial: "57", national: null },
  { code: "CU", name: "Cuba", dial: "53", national: null },
  { code: "DK", name: "Denmark", dial: "45", national: null },
  { code: "FR", name: "France", dial: "33", national: null },
  { code: "DE", name: "Germany", dial: "49", national: null },
  { code: "HT", name: "Haiti", dial: "509", national: null },
  { code: "IN", name: "India", dial: "91", national: null },
  { code: "IE", name: "Ireland", dial: "353", national: null },
  { code: "IL", name: "Israel", dial: "972", national: null },
  { code: "IT", name: "Italy", dial: "39", national: null },
  { code: "JP", name: "Japan", dial: "81", national: null },
  { code: "MX", name: "Mexico", dial: "52", national: null },
  { code: "NL", name: "Netherlands", dial: "31", national: null },
  { code: "NZ", name: "New Zealand", dial: "64", national: null },
  { code: "NG", name: "Nigeria", dial: "234", national: null },
  { code: "NO", name: "Norway", dial: "47", national: null },
  { code: "PH", name: "Philippines", dial: "63", national: null },
  { code: "PT", name: "Portugal", dial: "351", national: null },
  { code: "ZA", name: "South Africa", dial: "27", national: null },
  { code: "KR", name: "South Korea", dial: "82", national: null },
  { code: "ES", name: "Spain", dial: "34", national: null },
  { code: "SE", name: "Sweden", dial: "46", national: null },
  { code: "CH", name: "Switzerland", dial: "41", national: null },
  { code: "AE", name: "United Arab Emirates", dial: "971", national: null },
  { code: "GB", name: "United Kingdom", dial: "44", national: null, placeholder: "7400 123456" },
];

const DEFAULT_DIAL = "1242";
const BY_LENGTH = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

function countryFor(dial: string): Country {
  return PHONE_COUNTRIES.find((c) => c.dial === dial) ?? PHONE_COUNTRIES[0];
}

export function splitE164(value: string): { dial: string; digits: string } {
  const raw = value.trim();
  if (raw.startsWith("+") || raw.startsWith("00")) {
    const digits = raw.startsWith("+") ? raw.slice(1).replace(/\D/g, "") : raw.replace(/\D/g, "").replace(/^00/, "");
    const match = BY_LENGTH.find((c) => digits.startsWith(c.dial));
    return match ? { dial: match.dial, digits: digits.slice(match.dial.length) } : { dial: DEFAULT_DIAL, digits };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1242")) return { dial: DEFAULT_DIAL, digits: digits.slice(4) };
  if (digits.length === 10 && digits.startsWith("242")) return { dial: DEFAULT_DIAL, digits: digits.slice(3) };
  if (digits.length === 11 && digits.startsWith("1")) return { dial: "1", digits: digits.slice(1) };
  if (digits.length === 10) return { dial: "1", digits };
  return { dial: DEFAULT_DIAL, digits };
}

export function composeE164(dial: string, digits: string): string {
  return digits ? `+${dial}${digits}` : "";
}

// What people type into the national box, tidied for the chosen country:
// a Bahamian who types the 242 (or 1-242) loses it, a North American who
// types the leading 1 loses it, and nothing longer than the plan allows
// is kept.
export function tidyNational(dial: string, typed: string): string {
  let digits = typed.replace(/\D/g, "");
  const country = countryFor(dial);
  if (country.national === null) return digits.slice(0, 13);
  if (country.dial === "1") {
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  } else {
    const area = country.dial.slice(1);
    if (digits.startsWith(`1${area}`) && digits.length > country.national) digits = digits.slice(area.length + 1);
    else if (digits.startsWith(area) && digits.length > country.national) digits = digits.slice(area.length);
  }
  return digits.slice(0, country.national);
}

type Props = {
  value: string;
  onChange: (e164: string) => void;
  required?: boolean;
  name?: string;
  id?: string;
  autoComplete?: string;
  disabled?: boolean;
};

export function PhoneInput({ value, onChange, required, name, id, autoComplete = "tel-national", disabled }: Props) {
  const [dial, setDial] = useState(() => splitE164(value).dial);
  const [digits, setDigits] = useState(() => splitE164(value).digits);

  // Keep in step when the parent resets or fills the value from elsewhere.
  useEffect(() => {
    if (value === composeE164(dial, digits)) return;
    const next = splitE164(value);
    setDial(next.dial);
    setDigits(next.digits);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only external value changes matter here
  }, [value]);

  const country = countryFor(dial);

  return (
    <span className="phone-input">
      <select
        aria-label="Country code"
        value={dial}
        disabled={disabled}
        onChange={(event) => {
          const nextDial = event.target.value;
          const nextDigits = tidyNational(nextDial, digits);
          setDial(nextDial);
          setDigits(nextDigits);
          onChange(composeE164(nextDial, nextDigits));
        }}
      >
        {PHONE_COUNTRIES.map((c) => (
          <option key={c.code} value={c.dial}>
            +{c.dial.length === 4 && c.dial.startsWith("1") ? `1 ${c.dial.slice(1)}` : c.dial} {c.name}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        aria-label="Phone number"
        id={id}
        name={name}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        placeholder={country.placeholder ?? ""}
        value={digits}
        onChange={(event) => {
          const next = tidyNational(dial, event.target.value);
          setDigits(next);
          onChange(composeE164(dial, next));
        }}
      />
    </span>
  );
}
