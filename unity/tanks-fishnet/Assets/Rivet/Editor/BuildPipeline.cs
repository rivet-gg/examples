using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using System.IO;

namespace Rivet
{
    public class BuildScript : IPreprocessBuildWithReport, IPostprocessBuildWithReport
    {
        public int callbackOrder { get { return 0; } }

        public void OnPreprocessBuild(BuildReport report)
        {
            // Check if StreamingAssets folder exists and create it if it doesn't
            string streamingAssetsPath = Application.streamingAssetsPath;
            if (!Directory.Exists(streamingAssetsPath))
            {
                Directory.CreateDirectory(streamingAssetsPath);
            }

            // If either is null, add a build error
            if (string.IsNullOrEmpty(ExtensionData.ApiEndpoint))
            {
                Debug.LogError("Rivet API endpoint is not set. Please set the API endpoint in the Rivet settings.");
            }

            if (string.IsNullOrEmpty(ExtensionData.RivetToken))
            {
                Debug.LogError("Rivet token is not set. Please set the Rivet token in the Rivet settings.");
            }

            // Create the asset file before the build
            RivetSettings data = new RivetSettings
            {
                ApiEndpoint = ExtensionData.ApiEndpoint,
                RivetToken = ExtensionData.RivetToken
            };

            string json = JsonUtility.ToJson(data);
            string filePath = Path.Combine(Application.streamingAssetsPath, "rivet_export.json");
            File.WriteAllText(filePath, json);
        }

        public void OnPostprocessBuild(BuildReport report)
        {
            // Delete the asset file after the build
            string filePath = Path.Combine(Application.streamingAssetsPath, "rivet_export.json");
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
    }
}