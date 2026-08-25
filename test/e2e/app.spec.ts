import path from "node:path";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

let application: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  application = await electron.launch({
    args: [
      path.resolve("."),
      path.resolve("pA11990.gb"),
      "--no-sandbox",
      `--user-data-dir=${path.resolve("test-results/e2e-user-data")}`
    ],
    env: { ...process.env, NODE_ENV: "test" }
  });
  page = await application.firstWindow();
  await page.locator(".veEditor").waitFor({ state: "visible" });
});

test.afterAll(async () => {
  await application?.close();
});

test("keeps the native application menu and editor menu", async () => {
  const nativeMenu = await application.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items.map((item) => ({
      label: item.label,
      submenu: item.submenu?.items.map((child) => child.label)
    }))
  );
  expect(nativeMenu?.map(({ label }) => label)).toEqual(expect.arrayContaining(["File", "Edit", "View", "Tools", "Window"]));
  expect(nativeMenu?.find(({ label }) => label === "Tools")?.submenu).toContain("Primer Design");

  const editorMenu = page.locator(".veMenuBarContainer");
  await expect(editorMenu).toContainText("File");
  await expect(editorMenu).toContainText("Edit");
  await expect(editorMenu).toContainText("View");
  await expect(editorMenu).toContainText("Tools");
  await expect(editorMenu).toContainText("Help");
});

test("keeps the required toolbar order", async () => {
  const expectedOrder = [
    "saveTool", "downloadTool", "importTool", "undoTool", "redoTool", "cutsiteTool",
    "featureTool", "alignmentTool", "versionHistoryTool", "orfTool", "editTool", "findTool",
    "visibilityTool", "oligoTool"
  ];
  const actualOrder = await page.locator(".veToolbarItemOuter").evaluateAll((items) =>
    items.map((item) => [...item.classList]
      .find((className) => className.startsWith("ve-tool-container-"))
      ?.replace("ve-tool-container-", ""))
      .filter(Boolean)
  );
  expect(actualOrder).toEqual(expectedOrder);
});

test("opens Primer Design and preserves its interaction flow", async () => {
  await page.locator(".ve-tool-container-oligoTool button").click();
  const panel = page.getByRole("region", { name: "Primer Design" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Template Sequence")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Use Selection" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Use Full Vector" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Design Primers" })).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();
});

test("opens local alignment and local version history", async () => {
  await page.locator(".ve-tool-container-alignmentTool button").click();
  await expect(page.getByRole("region", { name: "Alignment" })).toContainText("Create Alignment");
  await page.getByRole("region", { name: "Alignment" }).getByRole("button", { name: "Close" }).click();

  await page.locator(".ve-tool-container-versionHistoryTool button").click();
  await expect(page.getByRole("region", { name: "Version History" })).toContainText("Saved Checkpoints");
  await page.getByRole("region", { name: "Version History" }).getByRole("button", { name: "Close" }).click();
});

test("persists dark mode through the named desktop API", async () => {
  const darkButton = page.getByRole("button", { name: "Toggle dark mode" });
  await darkButton.click();
  await expect(page.locator("body")).toHaveClass(/bp3-dark/);
  await page.reload();
  await page.locator(".veEditor").waitFor();
  await expect(page.locator("body")).toHaveClass(/bp3-dark/);
});

for (const viewport of [
  { width: 1000, height: 800, name: "1000x800" },
  { width: 1366, height: 768, name: "1366x768" },
  { width: 680, height: 720, name: "narrow" }
]) {
  test(`visual compatibility ${viewport.name}`, async () => {
    test.skip(!process.env.OVE_VISUAL_BASELINE, "Set OVE_VISUAL_BASELINE=1 after approving platform goldens.");
    await application.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
    }, viewport);
    await page.locator(".veEditor").waitFor();
    await expect(page).toHaveScreenshot(`editor-${viewport.name}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
      mask: [page.locator(".bp3-toast-container"), page.locator(".ove-menu-toast")]
    });
  });
}
