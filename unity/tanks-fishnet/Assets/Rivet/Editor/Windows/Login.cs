using UnityEngine;
using UnityEditor;
using Newtonsoft.Json.Linq;
using Rivet.Rivet;

namespace Rivet
{
    public class Login : RivetPluginWindow.IState
    {
        public RivetPluginWindow window;
        public string url;
        bool loginButtonEnabled = true;
        private bool showAdvancedOptions = false;

        public Login()
        {
        }

        public void OnEnter(RivetPluginWindow pluginWindow)
        {
            // Initialize the URL
            url = "";

            this.window = pluginWindow;

            // First, check if we're already logged in
            var result = RivetCLI.RunCommand(
                "sidekick",
                "check-login-state");

            switch (result)
            {
                case SuccessResult<JObject> getLinkSuccessResult:
                    if (getLinkSuccessResult.Data["Ok"] == null)
                    {
                        // RivetPluginBridge.DisplayCliError(result); TODO:
                        UnityEngine.Debug.LogError("Error: " + result.Data);
                        loginButtonEnabled = true;
                        return;
                    }

                    window.TransitionToState(new Plugin());

                    break;
            }
        }

        public void OnGUI()
        {
            UnityEditor.EditorGUI.BeginDisabledGroup(!loginButtonEnabled);

            if (GUILayout.Button("Sign in to Rivet"))
            {
                new System.Threading.Thread(() =>
                {
                    // Disable the button sign in button
                    loginButtonEnabled = false;

                    var getLinkResult = RivetCLI.RunCommand(
                        "--api-endpoint",
                        window.ApiEndpoint,
                        "sidekick",
                        "get-link");

                    switch (getLinkResult)
                    {
                        case SuccessResult<JObject> getLinkSuccessResult:
                            // Verify that the version that came back is correct
                            if (getLinkSuccessResult.Data["Ok"] == null)
                            {
                                // RivetPluginBridge.DisplayCliError(result); TODO:
                                UnityEngine.Debug.LogError("Error: " + getLinkResult.Data);
                                loginButtonEnabled = true;
                                return;
                            }

                            var data = getLinkSuccessResult.Data["Ok"];

                            // Now that we have the link, open it in the user's browser
                            EditorApplication.delayCall += () =>
                            {
                                Application.OpenURL(data["device_link_url"].ToString());
                            };

                            // Long-poll the Rivet API until the user has logged in
                            var waitForLoginResult = RivetCLI.RunCommand(
                                "--api-endpoint",
                                window.ApiEndpoint,
                                "sidekick",
                                "wait-for-login",
                                "--device-link-token",
                                data["device_link_token"].ToString());

                            switch (getLinkResult)
                            {
                                case SuccessResult<JObject> waitForLoginSuccessResult:
                                    if (waitForLoginSuccessResult.Data["Ok"] == null)
                                    {
                                        // RivetPluginBridge.DisplayCliError(result); TODO:
                                        UnityEngine.Debug.LogError("Error: " + getLinkResult.Data);
                                        loginButtonEnabled = true;
                                        return;
                                    }

                                    window.TransitionToState(new Plugin());

                                    break;

                                case ErrorResult<JObject> waitForLoginErrorResult:
                                    // RivetPluginBridge.DisplayCliError(result); TODO:
                                    UnityEngine.Debug.LogError("Error: " + getLinkResult.Data);
                                    loginButtonEnabled = true;
                                    return;

                            }

                            break;

                        case ErrorResult<JObject> errorResult:
                            // RivetPluginBridge.DisplayCliError(result); TODO:
                            UnityEngine.Debug.LogError("Error: " + getLinkResult.Data);
                            loginButtonEnabled = true;
                            return;
                        default:
                            UnityEngine.Debug.LogError("Error: " + getLinkResult.Data);
                            loginButtonEnabled = true;
                            return;
                    }
                }).Start();
            }

            UnityEditor.EditorGUI.EndDisabledGroup();

            // Display the Advanced Options dropdown
            showAdvancedOptions = EditorGUILayout.Foldout(showAdvancedOptions, "Advanced Options");

            if (showAdvancedOptions)
            {
                // Display the API Endpoint text box
                EditorGUILayout.LabelField("API Endpoint:");
                window.ApiEndpoint = EditorGUILayout.TextField(window.ApiEndpoint);
            }
        }
    }
}