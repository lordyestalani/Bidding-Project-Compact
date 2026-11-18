import { test, expect } from "@playwright/test";

test("create, edit both cash flows, simulate, archive and restore", async ({
  page,
}) => {
  await page.goto("/");
  const name = `Office equipment ${Date.now()}`;
  const projectRow = page
    .getByRole("complementary", { name: "Projects" })
    .getByRole("button", { name: new RegExp(name) });
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.getByLabel("New project name").fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Add cash flow", exact: true })
    .click();
  await page
    .getByLabel("Description 1", { exact: true })
    .fill("Customer payment");
  await page.getByLabel("Currency 1", { exact: true }).selectOption("USD");
  await page.getByLabel("Amount 1", { exact: true }).fill("100000");
  await page
    .getByRole("button", { name: "+ Add cash flow", exact: true })
    .click();
  await page
    .getByLabel("Description 2", { exact: true })
    .fill("Supplier costs");
  await page.getByLabel("Amount 2", { exact: true }).fill("5000000");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".profit-card")).toContainText("500,000.00");
  await expect(
    page.getByRole("img", { name: /profit and loss/i }),
  ).toBeVisible();
  await expect(page.getByTestId("chart-point-profit")).toContainText(
    "500,000.00",
  );
  const scenarioLine = page.getByTestId("scenario-chart-line");
  await expect(scenarioLine).toHaveCSS("stroke", "rgb(177, 148, 54)");
  const originalScenarioY = await scenarioLine.getAttribute("y1");
  await page.getByLabel("Scenario rate", { exact: true }).fill("58");
  await expect(page.getByTestId("scenario-profit")).toContainText("800,000.00");
  await expect
    .poll(() => scenarioLine.getAttribute("y1"))
    .not.toBe(originalScenarioY);
  await expect(page.locator(".scenario-difference")).toContainText(
    "300,000.00",
  );
  await page.getByLabel("Exchange rate slider").fill("60");
  await expect(page.getByTestId("scenario-profit")).toContainText(
    "1,000,000.00",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByTestId("scenario-profit")).toContainText("500,000.00");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("scenario-profit")).toContainText("500,000.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page.getByLabel("Amount 2", { exact: true }).fill("5100000");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".profit-card")).toContainText("400,000.00");
  await page.reload();
  await projectRow.click();
  await expect(page.locator(".profit-card")).toContainText("400,000.00");
  await page
    .getByRole("button", { name: "Archive project", exact: true })
    .click();
  await expect(projectRow).toHaveCount(0);
  await page.getByLabel("Show archived projects").check();
  await projectRow.click();
  await page
    .getByRole("button", { name: "Restore project", exact: true })
    .click();
  await page.getByLabel("Show archived projects").uncheck();
  await expect(projectRow).toBeVisible();
});

test("compare opposing USD exposures and open a project from the portfolio", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  for (const direction of ["incoming", "outgoing"]) {
    const name = `Portfolio ${direction} ${stamp}`;
    const created = await request.post("/api/projects", {
      data: { name, request_id: crypto.randomUUID() },
    });
    expect(created.ok()).toBe(true);
    const { id, version } = await created.json();
    const saved = await request.put(`/api/projects/${id}`, {
      data: {
        name,
        version,
        lines: [{ label: name, direction, currency: "USD", amount: "100" }],
      },
    });
    expect(saved.ok()).toBe(true);
  }

  await page.goto("/");
  const chart = page.getByRole("list", {
    name: "Estimated profit changes by project",
  });
  await page.getByLabel("Portfolio scenario rate", { exact: true }).fill("56");
  const income = chart.getByRole("button", { name: /Portfolio incoming/ });
  const cost = chart.getByRole("button", { name: /Portfolio outgoing/ });
  await expect(income).toContainText("PHP +100.00");
  await expect(cost).toContainText("PHP -100.00");
  await expect(income.locator(".gain-bar")).toBeVisible();
  await expect(cost.locator(".loss-bar")).toBeVisible();
  await income.click();
  await expect(
    page.getByRole("heading", { name: `Portfolio incoming ${stamp}` }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Bidding and FX home" }).click();
  await expect(
    page.getByLabel("Portfolio scenario rate", { exact: true }),
  ).toHaveValue("56");
  await expect(cost).toContainText("PHP -100.00");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
