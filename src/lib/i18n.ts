/**
 * Minimal multilingual scaffold (EN / BN / HI). Bengali & Hindi strings are
 * DRAFT machine-assisted translations that require native-speaker review.
 */
export type Lang = "en" | "bn" | "hi";
const dict = {
  tagline: { en: "Shared rides that cost less — never more than you agreed.", bn: "শেয়ার রাইডে কম খরচ — যা মেনে নিয়েছেন তার বেশি কখনও নয়।", hi: "शेयर राइड में कम खर्च — जितना तय किया उससे ज़्यादा कभी नहीं।" },
  book: { en: "Book a ride", bn: "রাইড বুক করুন", hi: "राइड बुक करें" },
  ceiling: { en: "Fare ceiling", bn: "সর্বোচ্চ ভাড়া", hi: "अधिकतम किराया" },
  guaranteed: { en: "You pay at most", bn: "আপনি সর্বোচ্চ দেবেন", hi: "आप अधिकतम देंगे" },
} as const;
export type Key = keyof typeof dict;
export function t(key: Key, lang: Lang = "en") {
  return dict[key][lang] ?? dict[key].en;
}
