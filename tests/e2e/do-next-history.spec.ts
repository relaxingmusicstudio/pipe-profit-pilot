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
  await page.addInitScript(() => {
    const now = new Date().toISOString();
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

    const onboardingState = {
      status: "complete",
      data: {
        businessName: "Pipeline Pros",
        industry: "HVAC",
        serviceArea: "Austin",
        primaryGoal: "Increase demos",
        offerPricing: "Tune-up $129",
        targetCustomer: "Homeowners",
        leadSources: "Google Ads",
        calendarLink: "https://cal.com/demo",
        contactPhone: "555-555-5555",
      },
      updatedAt: now,
    };

    window.localStorage.setItem("ppp:onboarding:v1::mock-user", JSON.stringify(onboardingState));
    window.localStorage.setItem("onboarding_v1::mock-user", JSON.stringify(onboardingState));
    window.localStorage.setItem("ppp:onboarding:v1::anonymous", JSON.stringify(onboardingState));

    const plan = {
      planMarkdown: "## Goals\n- Draft landing page\n- Launch ads\n- Follow up leads",
      createdAt: now,
      updatedAt: now,
      onboardingSnapshotHash: "mock-hash",
    };

    window.localStorage.setItem("ppp:ceoPlan:v1::mock-user", JSON.stringify(plan));
    window.localStorage.setItem("ppp:ceoPlan:v1::anonymous", JSON.stringify(plan));
    window.localStorage.removeItem("ppp:ceoDoNextHistory:v1::mock-user");
    window.localStorage.removeItem("ppp:ceoDoNext:v1::mock-user");
  });
});

test("Do Next produces output and stores selectable history", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/auth");
  await page.getByLabel(/email/i).fill("ceo@example.com");
  await page.getByLabel(/password/i).fill("password123");
  await page.getByTestId("sign-in").click();

  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByTestId("dashboard-home")).toBeVisible();
  await expect(page.getByText("CEO Plan")).toBeVisible();

  await page.getByTestId("do-next-button").click();

  const output = page.getByTestId("do-next-output");
  await expect(output).toBeVisible();
  await expect(output).toContainText("Next step:");

  const historyList = page.getByTestId("do-next-history-list");
  if (!(await historyList.isVisible())) {
    await page.getByTestId("do-next-history-toggle").click();
  }

  const historyItems = historyList.getByTestId("do-next-history-item");
  await expect(historyItems).toHaveCount(1);

  await historyItems.first().click();
  await expect(output).toContainText("Next step:");

  expect(errors, errors.join("\n")).toEqual([]);
});
