import { runCli } from "./commands";
import { describeFailure } from "./failures";

/** Entry point: results go to stdout as JSON, failures to stderr as one line. */
runCli(process.argv.slice(2), process.env).then(
  ({ output, exitCode }) => {
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    const { message, exitCode } = describeFailure(error);
    console.error(message);
    process.exitCode = exitCode;
  },
);
