// D-040: an amount in words for a money receipt and the Payment in message, in the lakh / crore
// system: 1,05,000 → "Taka One Lakh Five Thousand Only". Pure; integer poisha.

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", belowHundred(n % 100)]
    .filter(Boolean)
    .join(" ");
}

/** Whole taka in words: crore, lakh, thousand, hundred (a crore count can be large itself). */
function inWords(n: number): string {
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  return [
    crore ? `${inWords(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    belowThousand(n % 1000),
  ]
    .filter(Boolean)
    .join(" ");
}

/** 5_000_000 poisha → "Taka Fifty Thousand Only"; 5_050 → "Taka Fifty and Fifty Poisha Only". */
export function toWords(poisha: number): string {
  const abs = Math.abs(poisha);
  const taka = Math.floor(abs / 100);
  const paisa = abs % 100;
  const whole = taka ? inWords(taka) : "Zero";
  return `Taka ${whole}${paisa ? ` and ${belowHundred(paisa)} Poisha` : ""} Only`;
}
