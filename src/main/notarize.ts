import path from "node:path";
import { notarize } from "@electron/notarize";

interface AfterSignContext {
  electronPlatformName: string;
  appOutDir: string;
  packager: { appInfo: { productFilename: string; appId: string } };
}

export default async function afterSign(context: AfterSignContext): Promise<void> {
  if (
    context.electronPlatformName !== "darwin" ||
    !process.env.APPLEID ||
    !process.env.APPLEIDPASS ||
    !process.env.APPLETEAMID
  ) {
    return;
  }
  await notarize({
    appPath: path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`
    ),
    appleId: process.env.APPLEID,
    appleIdPassword: process.env.APPLEIDPASS,
    teamId: process.env.APPLETEAMID
  });
}
