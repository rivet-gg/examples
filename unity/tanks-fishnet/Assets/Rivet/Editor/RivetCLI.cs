using System.IO;
using Newtonsoft.Json.Linq;

namespace Rivet
{
    public static class RivetCLI
    {
        public const string REQUIRED_RIVET_CLI_VERSION = "v1.0.1";
        public const string RIVET_CLI_PATH_SETTING = "RivetCLIPath";

        public static bool CLIInstalled()
        {
            string editorRivetPath = GetRivetCLIPath();

            if (string.IsNullOrEmpty(editorRivetPath))
            {
                return false;
            }

            var result = RunCommand("sidekick", "get-cli-version");
            switch (result)
            {
                case SuccessResult<JObject> successResult:
                    // Verify that the version that came back is correct
                    if (successResult.Data["Ok"] == null)
                    {
                        return false;
                    }
                    var cliVersion = successResult.Data["Ok"]["version"].ToString();
                    if (cliVersion != REQUIRED_RIVET_CLI_VERSION)
                    {
                        return false;
                    }
                    return true;
                default:
                    return false;
            }
        }

        public static Result<JObject> RunCommand(params string[] args)
        {
            return RunRivetCLI(args);
        }

        public static string GetBinDir()
        {
            string homePath = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile);
            return Path.Combine(homePath, ".rivet", REQUIRED_RIVET_CLI_VERSION, "bin");
        }

        public static string GetRivetCLIPath()
        {
            return Path.Combine(GetBinDir(), "rivet");
        }

        public static Result<JObject> RunRivetCLI(params string[] args)
        {
            // TODO: Turn this on if debug is enabled
            // UnityEngine.Debug.Log($"Running Rivet CLI: {GetRivetCLIPath()} {string.Join(" ", args)}");

            if (!File.Exists(GetRivetCLIPath()))
            {
                // TODO: Turn this on if debug is enabled
                // UnityEngine.Debug.LogError("File does not exist: " + GetRivetCLIPath());
                return new ErrorResult<JObject>("File does not exist: " + GetRivetCLIPath());
            }

            var startInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = GetRivetCLIPath(),
                Arguments = string.Join(" ", args),
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            try
            {
                using var process = System.Diagnostics.Process.Start(startInfo);
                var output = process.StandardOutput.ReadToEnd();
                process.WaitForExit();

                return new SuccessResult<JObject>(JObject.Parse(output));
            }
            catch (System.Exception ex)
            {
                return new ErrorResult<JObject>("Failed to start process: " + ex.Message);
            }
        }

        public static Result<string> Install()
        {
            string bin_dir = GetBinDir();

            System.Environment.SetEnvironmentVariable("RIVET_CLI_VERSION", REQUIRED_RIVET_CLI_VERSION);
            System.Environment.SetEnvironmentVariable("BIN_DIR", bin_dir);

            var process = new System.Diagnostics.Process();
            process.StartInfo.UseShellExecute = false;
            process.StartInfo.RedirectStandardOutput = true;

            if (System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows))
            {
                process.StartInfo.FileName = "powershell.exe";
                process.StartInfo.Arguments = "-Command \"iwr https://raw.githubusercontent.com/rivet-gg/cli/$env:RIVET_CLI_VERSION/install/windows.ps1 -useb | iex\"";
            }
            else
            {
                process.StartInfo.FileName = "/bin/sh";
                process.StartInfo.Arguments = "-c \"curl -fsSL https://raw.githubusercontent.com/rivet-gg/cli/${RIVET_CLI_VERSION}/install/unix.sh | sh\"";
            }

            process.Start();
            string output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            return new SuccessResult<string>(output);
        }
    }
}