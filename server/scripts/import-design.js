import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { connect } from "./runtime.js";
import { importDesignBoard } from "../src/design-import.js";
const { values } = parseArgs({
  options: {
    file: { type: "string" },
    data: { type: "string" },
    owner: { type: "string" },
    publish: { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    bundled: { type: "boolean", default: false },
  },
});
let ctx;
try {
  if (!values.file || !values.data)
    throw Error(
      "Use --file <image> --data <template.json> [--owner <admin-email>] [--publish] [--bundled] [--execute].",
    );
  const template = JSON.parse(await readFile(values.data, "utf8"));
  const buffer = await readFile(values.file);
  if (!values.execute) {
    console.log(
      JSON.stringify(
        {
          mode: "preview-only",
          title: template.design?.title,
          code: template.design?.code,
          previews: template.design?.imageViews?.length,
          status: values.publish ? "published" : "draft",
          imageBytes: buffer.length,
          imageStorage: values.bundled ? "included original board" : "ImageKit",
          next: "Add --execute to upload the image and create this catalogue entry. Existing codes are never overwritten.",
        },
        null,
        2,
      ),
    );
  } else {
    ctx = await connect();
    const result = await importDesignBoard(ctx, {
      template,
      buffer,
      ownerEmail: values.owner,
      publish: values.publish,
      bundled: values.bundled,
    });
    console.log(
      JSON.stringify(
        {
          created: result.created,
          id: String(result.design._id),
          title: result.design.title,
          status: result.design.status,
          path: "/designs/" + result.design.slug,
          previews: result.design.imageViews?.length,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      code: String(error.code || error.name),
      message:
        error.status || !ctx
          ? error.message
          : "Import failed. Check configuration and connectivity; existing records were not overwritten.",
    }),
  );
  process.exitCode = 1;
} finally {
  if (ctx) await ctx.disconnect();
}
