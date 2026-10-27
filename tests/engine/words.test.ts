import { describe, expect, it } from "vitest";
import { toWords } from "@/lib/words";

// D-040: the amount in words (lakh / crore), for the Payment in message and the money receipt.
describe("U-CR-020.4 toWords", () => {
  it.each([
    [0, "Taka Zero Only"],
    [100, "Taka One Only"],
    [5_000_000, "Taka Fifty Thousand Only"],
    [10_500_000, "Taka One Lakh Five Thousand Only"],
    [10_810_000, "Taka One Lakh Eight Thousand One Hundred Only"],
    [
      1_234_567_800,
      "Taka One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only",
    ],
    [150_000_000_000, "Taka One Hundred Fifty Crore Only"],
    [5_050, "Taka Fifty and Fifty Poisha Only"],
    [1_999_919, "Taka Nineteen Thousand Nine Hundred Ninety Nine and Nineteen Poisha Only"],
    [5, "Taka Zero and Five Poisha Only"],
  ])("%i poisha → %s", (poisha, words) => {
    expect(toWords(poisha)).toBe(words);
  });
});
