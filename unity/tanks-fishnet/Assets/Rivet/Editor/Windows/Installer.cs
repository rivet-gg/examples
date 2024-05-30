using UnityEngine;
using UnityEditor;
using Rivet.Rivet;

namespace Rivet
{
    public class Installer : RivetPluginWindow.IState
    {
        public RivetPluginWindow window;
        public string installLabelText;
        public bool installButtonEnabled;

        public Installer()
        {
        }

        public void OnEnter(RivetPluginWindow pluginWindow)
        {
            this.window = pluginWindow;

            // Prepare the installer
            installLabelText = ReplacePlaceholders("%%version%% %%bin_dir%%");
            installButtonEnabled = false;

            // Start a new thread
            new System.Threading.Thread(() =>
            {
                if (RivetCLI.CLIInstalled())
                {
                    // Change to the Login screen
                    window.TransitionToState(new Login());
                }
                else
                {
                    installButtonEnabled = true;
                }
            }).Start();
        }

        public void OnGUI()
        {
            // Code to run every frame in the Installer state
            EditorGUILayout.LabelField(installLabelText);
            EditorGUI.BeginDisabledGroup(!installButtonEnabled);
            if (GUILayout.Button("Install"))
            {
                // Handle the Install button click
                new System.Threading.Thread(() =>
                {
                    var result = RivetCLI.Install();

                    switch (result)
                    {
                        case SuccessResult<string> successResult:
                            // Change to the Login screen
                            window.TransitionToState(new Login());
                            break;
                        case ErrorResult<string> errorResult:
                            // Debug the error
                            UnityEngine.Debug.LogError(errorResult.Message);
                            break;
                    }
                }).Start();
            }
            EditorGUI.EndDisabledGroup();
        }

        public string ReplacePlaceholders(string text)
        {
            return text.Replace("%%version%%", RivetCLI.REQUIRED_RIVET_CLI_VERSION)
                       .Replace("%%bin_dir%%", RivetCLI.GetBinDir());
        }
    }
}