using UnityEngine;
using UnityEditor;

namespace Rivet
{
    /// <summary>
    /// Provides extension data for the Rivet plugin.
    /// </summary>
    public static class ExtensionData
    {
        private static string rivetToken;
        private static string apiEndpoint = "https://api.rivet.gg";

        /// <summary>
        /// Gets or sets the Rivet token.
        /// </summary>
        /// <remarks>
        /// The Rivet token is used for authentication with the Rivet API.
        /// When the token is set, it is also stored in the PlayerPrefs for persistence.
        /// </remarks>
        public static string RivetToken
        {
            get { return rivetToken; }
            set
            {
                rivetToken = value;
                // This might not be called from the main thread, so we need to
                // delay the call to PlayerPrefs
                UnityEditor.EditorApplication.delayCall += () =>
                {
                    PlayerPrefs.SetString("RivetToken", value);
                };
            }
        }

        /// <summary>
        /// Gets or sets the API endpoint.
        /// </summary>
        /// <remarks>
        /// The API endpoint is the base URL for the Rivet API.
        /// When the endpoint is set, it is also stored in the PlayerPrefs for persistence.
        /// </remarks>
        public static string ApiEndpoint
        {
            get { return apiEndpoint; }
            set
            {
                apiEndpoint = value;
                // This might not be called from the main thread, so we need to
                // delay the call to PlayerPrefs
                UnityEditor.EditorApplication.delayCall += () =>
                {
                    PlayerPrefs.SetString("ApiEndpoint", value);
                };
            }
        }
    }

    namespace Rivet
    {
        public class RivetPluginWindow : EditorWindow
        {
            public string ApiEndpoint
            {
                get { return ExtensionData.ApiEndpoint; }
                set { ExtensionData.ApiEndpoint = value; }
            }

            public string RivetToken
            {
                get { return ExtensionData.RivetToken; }
                set { ExtensionData.RivetToken = value; }
            }

            // Define an interface for the states
            public interface IState
            {
                void OnEnter(RivetPluginWindow pluginWindow);
                void OnGUI();
            }

            [MenuItem("Window/Rivet Plugin")]
            public static void ShowWindow()
            {
                GetWindow<RivetPluginWindow>("Rivet Plugin");
            }

            // Add a variable to hold the current state
            public IState currentState;

            // Add a method to handle the state transitions
            public void TransitionToState(IState newState)
            {
                currentState = newState;
                currentState.OnEnter(this);
            }

            private Texture2D rivetLogo;

            void OnGUI()
            {
                // Create an outer vertical container
                GUILayout.BeginVertical();

                // Draw the Rivet logo
                if (rivetLogo != null)
                {
                    GUILayout.Label(rivetLogo);
                }
                else
                {
                    // Load the Rivet logo
                    rivetLogo = (Texture2D)AssetDatabase.LoadAssetAtPath("Assets/Rivet/Editor/Images/icon-text-white.png", typeof(Texture2D));
                    Debug.Log("Rivet logo not found");
                }

                // Draw the global Rivet buttons

                // Links
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("Hub")) Application.OpenURL("https://hub.rivet.gg/");
                if (GUILayout.Button("Docs")) Application.OpenURL("https://rivet.gg/docs");
                if (GUILayout.Button("Discord")) Application.OpenURL("https://rivet.gg/discord");
                GUILayout.EndHorizontal();

                // Call the OnGUI method of the current state
                currentState.OnGUI();

                // End the vertical container
                GUILayout.EndVertical();
            }

            void OnEnable()
            {
                // Initialize the state machine
                TransitionToState(new Installer());
            }
        }
    }
}