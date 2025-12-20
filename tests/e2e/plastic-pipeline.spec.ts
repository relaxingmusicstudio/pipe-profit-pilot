import { test, expect, Page } from "@playwright/test";

const shouldMockAuth = process.env.VITE_MOCK_AUTH === "true";

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "assert") errors.push(`console:${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`page:${err.message}`));
  return errors;
};

test.beforeEach(async ({ page }) => {
  if (!shouldMockAuth) return;
  await page.addInitScript(() => {
    window.localStorage.setItem("VITE_MOCK_AUTH", "true");
    window.localStorage.setItem("cookie_consent", "true");
    window.localStorage.setItem(
      "cookie_preferences",
      JSON.stringify({ essential: true, analytics: false, functional: false, marketing: false })
    );
    window.localStorage.setItem(
      "enhanced_tracking_consent",
      JSON.stringify({ enhanced_analytics: false, marketing_emails: false, personalization: false })
    );
    window.localStorage.setItem("enhanced_tracking_asked", "true");
    window.localStorage.setItem(
      "onboarding_v1::mock-user",
      JSON.stringify({ status: "complete", data: {}, updatedAt: new Date().toISOString() })
    );
  });
});

test("create lead, book consult, track analytics", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/auth");
  await page.getByLabel(/email/i).fill("ceo@example.com");
  await page.getByLabel(/password/i).fill("password123");
  await page.getByTestId("sign-in").click();
  await expect(page).toHaveURL(/\/app/);

  await page.getByRole("link", { name: "Plastic Surgeon" }).click();
  await expect(page.getByTestId("plastic-pipeline-page")).toBeVisible();

  await page.getByTestId("lead-name").fill("Jane Doe");
  await page.getByTestId("lead-clinic").fill("Aesthetic Clinic");
  await page.getByTestId("lead-city").fill("Austin");
  await page.getByTestId("lead-phone").fill("555-111-2222");
  await page.getByTestId("lead-email").fill("jane@example.com");
  await page.getByTestId("lead-ig").fill("@jane");
  await page.getByTestId("lead-notes").fill("Rhinoplasty interest");
  await page.getByTestId("create-lead").click();
  await expect(page.getByTestId("lead-row")).toContainText("Jane Doe");

  // Advance stage once
  const advanceBtn = await page.getByTestId(/advance-/).first();
  await advanceBtn.click();

  // Booking
  await page.getByRole("tab", { name: "Booking" }).click();
  await page.getByTestId("consult-lead-select").click();
  await page.getByRole("option", { name: "Jane Doe" }).click();
  await page.getByTestId("consult-datetime").fill("2025-12-20T10:00");
  await page.getByTestId("consult-status").click();
  await page.getByRole("option", { name: "Showed" }).click();
  await page.getByTestId("consult-notes").fill("Consult completed");
  await page.getByTestId("save-consult").click();

  // Analytics
  await page.getByRole("tab", { name: "Analytics" }).click();
  await page.getByTestId("ad-spend-input").fill("100");
  await expect(page.getByTestId("kpi-consults")).toContainText("1");
  await expect(page.getByTestId("kpi-show-rate")).toContainText("100%");
  await expect(page.getByTestId("kpi-net-profit")).toContainText("350");

  // Feedback
  await page.getByTestId("feedback-up-creative-1").click();
  await expect(page.getByTestId("feedback-top")).toContainText("Top performer");

  expect(errors, errors.join("\n")).toEqual([]);
});
