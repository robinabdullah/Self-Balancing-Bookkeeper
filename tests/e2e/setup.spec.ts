import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { goHome, noSideScroll } from "./helpers";

// Task 3.2 (UIDD §3, §4.11; D-023): the Setup lists in the modal form shell (3.2.6).
test.describe("Setup screens (task 3.2)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("3.2 add, edit and delete a model in the modal form", async ({ page }) => {
    const name = `E2E Model ${randomUUID().slice(0, 8)}`;
    await page.goto("/setup?tab=model");
    await page.getByRole("button", { name: "Add model" }).click();

    const form = page.getByRole("dialog", { name: "Add model" });
    await expect(form.getByText("Purchases and sales pick from this list.")).toBeVisible();
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Enter the model name")).toBeVisible();
    await noSideScroll(page, "horizontal scroll");

    await form.getByLabel("Model name").fill(name);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toBeHidden();
    await page.getByRole("button", { name, exact: true }).click();

    const edit = page.getByRole("dialog", { name: "Edit model" });
    await edit.getByLabel("Model name").fill(`${name} 4/64`);
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();

    await page.getByRole("button", { name: `Actions for ${name} 4/64` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("button", { name: `${name} 4/64`, exact: true })).toBeHidden();
  });

  test("3.2 Walk-in is read-only; a card shows its ⓘ help", async ({ page }) => {
    await page.goto("/setup?tab=customer");
    const walkIn = page.getByRole("listitem").filter({ hasText: "Walk-in" });
    await expect(walkIn.getByText("Built-in")).toBeVisible();
    await expect(walkIn.getByRole("button", { name: /Actions for/ })).toHaveCount(0);

    await page.goto("/setup?tab=card");
    await page.getByRole("button", { name: "Add card" }).click();
    const form = page.getByRole("dialog", { name: "Add card" });
    await form.getByRole("button", { name: "About Statement day" }).click();
    await expect(form.getByText("A charge on or before it goes on that bill.")).toBeVisible();
  });

  // CR-016.5 (D-036): the Type is a chip; a name that still says it gets a note.
  test("E-CR-016.5 a card's Type: chips, the name note, and Owner · Name Type", async ({
    page,
  }, info) => {
    const bank = `E2E Bank ${randomUUID().slice(0, 6)}`;
    await page.goto("/setup?tab=card");
    await page.getByRole("button", { name: "Add card" }).click();
    const form = page.getByRole("dialog", { name: "Add card" });
    await expect(form.getByRole("radio", { name: "None" })).toBeChecked();
    await form.getByLabel("Card name").fill(`${bank} Visa`);
    await form.getByRole("radio", { name: "Visa" }).check();
    await expect(form.getByText("Remove ‘Visa’ from the name — it’s the Type")).toBeVisible();
    await form.getByLabel("Card name").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("card-type.png") });
    await form.getByRole("radio", { name: "Mastercard" }).check();
    await expect(form.getByText(/from the name/)).toBeHidden();
    await form.getByRole("radio", { name: "Visa" }).check();
    await form.getByLabel("Card name").fill(bank);
    await expect(form.getByText(/from the name/)).toBeHidden();

    await form.getByRole("button", { name: "Owner" }).click();
    await page.getByRole("dialog", { name: "Owner" }).getByRole("option").first().click();
    await form.getByRole("textbox", { name: "Statement day" }).fill("5");
    await form.getByRole("textbox", { name: "Due day" }).fill("20");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole("listitem").filter({ hasText: `· ${bank} Visa` })).toBeVisible();
  });
});

// Task 3.3 (UIDD §1.2, §5): the shared picker with "+ Add new", and the "Saved" toast.
test.describe("Shared form UI (task 3.3)", () => {
  test.beforeEach(async ({ page }) => goHome(page));

  test("3.3 a picker's + Add new saves a person and returns it selected", async ({ page }) => {
    const person = `E2E Owner ${randomUUID().slice(0, 8)}`;
    const card = `E2E Card ${randomUUID().slice(0, 8)}`;
    await page.goto("/setup?tab=card");
    await page.getByRole("button", { name: "Add card" }).click();
    const form = page.getByRole("dialog", { name: "Add card" });
    await form.getByLabel("Card name").fill(card);

    await form.getByRole("button", { name: "Owner" }).click();
    const picker = page.getByRole("dialog", { name: "Owner" });
    await picker.getByRole("button", { name: "Add new" }).click();

    const add = page.getByRole("dialog", { name: "Add person" });
    await add.getByLabel("Name").fill(person);
    await add.getByRole("radio", { name: "Investor" }).check();
    await add.getByRole("button", { name: "Save" }).click();
    await expect(add).toBeHidden();
    await expect(form).toBeVisible(); // the card form stays open, not submitted
    await expect(form.getByRole("button", { name: "Owner" })).toHaveText(person);
    await expect(page.getByRole("status").getByText("Saved")).toBeVisible();

    await form.getByRole("textbox", { name: "Statement day" }).fill("28");
    await form.getByRole("textbox", { name: "Due day" }).fill("12");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toBeHidden();
    await expect(
      page.getByRole("listitem").filter({ hasText: `${person} · ${card}` }),
    ).toBeVisible();

    // The picker searches, and a list shows its empty hint when nothing matches.
    await page.getByRole("button", { name: "Add card" }).click();
    await page
      .getByRole("dialog", { name: "Add card" })
      .getByRole("button", { name: "Owner" })
      .click();
    const search = page.getByRole("dialog", { name: "Owner" });
    await search.getByLabel("Search Owner").fill(person);
    await expect(search.getByRole("option")).toHaveCount(1);
    await search.getByLabel("Search Owner").fill("zzz-no-match");
    await expect(search.getByText("Nothing matches.")).toBeVisible();
  });
});
