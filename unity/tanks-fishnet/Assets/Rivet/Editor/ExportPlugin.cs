using System.Linq;
using UnityEditor;
using UnityEngine;

public class ExportPackage
{
    [MenuItem("Assets/Export My Plugin")]
    public static void Export()
    {
        string[] projectContent = AssetDatabase.GetAllAssetPaths();
        var assetsToExport = projectContent.Where(path => path.StartsWith("Assets/Rivet")).ToArray();
        AssetDatabase.ExportPackage(assetsToExport, "Rivet.unitypackage", ExportPackageOptions.Recurse);
        Debug.Log("Project Exported");
    }
}