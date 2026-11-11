export async function readPassword() {
  if (!process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    let value = "";
    for await (const chunk of process.stdin) {
      value += chunk.toString("utf8");
      if (Buffer.byteLength(value, "utf8") > 1024)
        throw new Error("Password input is too long.");
    }
    return value.replace(/\r?\n$/, "");
  }
  process.stderr.write("New password (input hidden): ");
  const input = process.stdin;
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003")
          return finish(new Error("Password reset cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") {
          value = [...value].slice(0, -1).join("");
        } else {
          value += character;
        }
        if (Buffer.byteLength(value, "utf8") > 1024)
          return finish(new Error("Password input is too long."));
      }
    };
    input.on("data", onData);
  });
}
