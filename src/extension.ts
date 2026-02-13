import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let statusBarItem: vscode.StatusBarItem;
let syncTimer: NodeJS.Timeout | undefined;
let isSyncing = false;

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBarIcon();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const toggleCommand = vscode.commands.registerCommand('flutter-assets-generator.toggleAutoSync', async () => {
        const config = vscode.workspace.getConfiguration('flutter-assets-generator');
        const currentState = config.get<boolean>('autoSync', true);
        await config.update('autoSync', !currentState, vscode.ConfigurationTarget.Global);
        
        updateStatusBarIcon();
        const msg = !currentState ? "Auto-Sync Enabled ⚡" : "Auto-Sync Disabled ⏸️";
        vscode.window.showInformationMessage(`AssetsApp: ${msg}`);
    });

    const forceGenerateCommand = vscode.commands.registerCommand('flutter-assets-generator.forceGenerate', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            runFullSync(workspaceFolders[0].uri, true);
            vscode.window.showInformationMessage('AssetsApp: Manual Sync Completed! ✅');
        }
    });

    const watcher = vscode.workspace.createFileSystemWatcher('**/assets/**/*');
    
    watcher.onDidCreate(uri => debouncedSync(uri));
    watcher.onDidChange(uri => debouncedSync(uri));
    watcher.onDidDelete(uri => debouncedSync(uri));

    const renameListener = vscode.workspace.onDidRenameFiles(event => {
        if (event.files.length > 0) {
            debouncedSync(event.files[0].newUri);
        }
    });

    context.subscriptions.push(watcher, toggleCommand, forceGenerateCommand, renameListener);
}


function debouncedSync(uri: vscode.Uri) {
    if (syncTimer) {
        clearTimeout(syncTimer);
    }
    syncTimer = setTimeout(() => {
        if (!isSyncing) {
            runFullSync(uri);
        }
    }, 600); 
}

function updateStatusBarIcon() {
    const config = vscode.workspace.getConfiguration('flutter-assets-generator');
    const isAuto = config.get<boolean>('autoSync', true);
    
    if (isAuto) {
        statusBarItem.text = `$(zap) Assets Auto-Sync: Active`;
        statusBarItem.tooltip = "Assets Auto-Sync is Active (Click to pause)";
        statusBarItem.color = "#4fd1c5";
    } else {
        statusBarItem.text = `$(circle-slash) Assets Auto-Sync: Paused`;
        statusBarItem.tooltip = "Assets Auto-Sync is Paused (Click to resume)";
        statusBarItem.color = "#f56565";
    }
    statusBarItem.command = 'flutter-assets-generator.toggleAutoSync';
}

function runFullSync(uri: vscode.Uri, force: boolean = false) {
    const config = vscode.workspace.getConfiguration('flutter-assets-generator');
    const isAuto = config.get<boolean>('autoSync', true);

    if (!isAuto && !force) return;
    if (isSyncing) return;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) return;

    const assetsPath = path.join(workspaceFolder.uri.fsPath, 'assets');
    if (!fs.existsSync(assetsPath)) return;

    isSyncing = true;
    statusBarItem.text = `$(sync~spin) Syncing...`;
    statusBarItem.color = "#fbbf24"; 

    try {
        syncPubspecYaml(workspaceFolder.uri.fsPath, assetsPath);
        generateAllAssetsClasses(workspaceFolder.uri.fsPath, assetsPath);
        
        statusBarItem.text = `$(check) Assets Synced ✅`;
        statusBarItem.color = "#4fd1c5";

        setTimeout(() => {
            updateStatusBarIcon();
            isSyncing = false;
        }, 2000); 

    } catch (error) {
        console.error("Sync Error:", error);
        vscode.window.showErrorMessage('AssetsApp: Failed to sync assets.');
        isSyncing = false;
        updateStatusBarIcon();
    }
}

function generateAllAssetsClasses(rootPath: string, assetsPath: string) {
    const config = vscode.workspace.getConfiguration('flutter-assets-generator');
    const relativeOutDir = config.get<string>('outputDirectory', 'lib/constants/assets');
    
    const outDir = path.join(rootPath, ...relativeOutDir.split(/[/\\]/));

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const subdirs = fs.readdirSync(assetsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    let partsDecl = '';
    let appAssetsBody = '';
    const generatedFiles: string[] = ['assets_app.dart'];

    for (const rootFolder of subdirs) {
        const rootFolderPath = path.join(assetsPath, rootFolder);
        const baseName = rootFolder.endsWith('s') ? rootFolder.slice(0, -1) : rootFolder;
        const partFileName = `${baseName}.dart`;
        const rootClassName = `_${baseName.charAt(0).toUpperCase() + baseName.slice(1)}`;
        const propName = formatPropertyName(rootFolder);

        partsDecl += `part '${partFileName}';\n`;
        appAssetsBody += `  static const ${propName} = ${rootClassName}();\n`;
        generatedFiles.push(partFileName);

        let partContent = `part of 'assets_app.dart';\n\n`;
        partContent += generateClassRecursively(rootFolderPath, rootFolder, rootClassName);

        fs.writeFileSync(path.join(outDir, partFileName), partContent);
    }

    let mainContent = partsDecl + '\n';
    mainContent += `class AssetsApp {\n`;
    mainContent += `  AssetsApp._();\n\n`;
    mainContent += appAssetsBody;
    mainContent += `}\n`;

    fs.writeFileSync(path.join(outDir, 'assets_app.dart'), mainContent);

    const existingFiles = fs.readdirSync(outDir);
    for (const file of existingFiles) {
        if (!generatedFiles.includes(file) && file.endsWith('.dart')) {
            fs.unlinkSync(path.join(outDir, file));
        }
    }
}

function generateClassRecursively(dirPath: string, relativePath: string, className: string): string {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = items.filter(item => item.isFile() && !item.name.startsWith('.'));
    const dirs = items.filter(item => item.isDirectory() && !/^\d\.\dx$/.test(item.name));

    let classContent = `class ${className} {\n`;
    classContent += `  const ${className}();\n\n`;

    let nestedClassesContent = '';

    for (const dir of dirs) {
        const nestedPropName = formatPropertyName(dir.name);
        const nestedClassName = `${className}${dir.name.charAt(0).toUpperCase() + dir.name.slice(1)}`;
        classContent += `  final ${nestedClassName} ${nestedPropName} = const ${nestedClassName}();\n`;
        nestedClassesContent += generateClassRecursively(
            path.join(dirPath, dir.name), 
            `${relativePath}/${dir.name}`, 
            nestedClassName
        );
    }

    for (const file of files) {
        const propName = formatPropertyName(file.name.replace(/\.[^/.]+$/, ""));
        const forwardSlashPath = relativePath.replace(/\\/g, '/');
        const isSvg = file.name.toLowerCase().endsWith('.svg');
        const comment = isSvg ? ' // SVG File' : '';
        classContent += `  final String ${propName} = 'assets/${forwardSlashPath}/${file.name}';${comment}\n`;
    }

    classContent += `}\n\n`;
    return classContent + nestedClassesContent;
}

function formatPropertyName(name: string): string {
    let camelCase = name.replace(/[-_]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/[^a-zA-Z0-9]/g, '');
    
    if (camelCase.length > 0) {
        camelCase = camelCase.charAt(0).toLowerCase() + camelCase.slice(1);
    }
    
    if (/^\d/.test(camelCase)) camelCase = 'item' + camelCase;
    
    const dartKeywords = ['class', 'switch', 'return', 'default', 'break', 'if', 'else', 'for', 'var', 'final', 'const'];
    if (dartKeywords.includes(camelCase)) {
        camelCase += 'Asset';
    }
    
    return camelCase || 'unknown';
}

function syncPubspecYaml(rootPath: string, assetsPath: string) {
    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return;

    const requiredAssets: string[] = [];
    function scanDirs(dirPath: string, relPath: string) {
        const forwardSlashPath = relPath.replace(/\\/g, '/');
        requiredAssets.push(`- assets/${forwardSlashPath}/`);
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory() && !/^\d\.\dx$/.test(item.name)) {
                scanDirs(path.join(dirPath, item.name), `${relPath}/${item.name}`);
            }
        }
    }

    const rootDirs = fs.readdirSync(assetsPath, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of rootDirs) {
        scanDirs(path.join(assetsPath, dir.name), dir.name);
    }

    let content = fs.readFileSync(pubspecPath, 'utf8');
    let lines = content.split('\n');
    let flutterIndex = lines.findIndex(l => l.startsWith('flutter:'));
    if (flutterIndex === -1) { lines.push('', 'flutter:', '  assets:'); flutterIndex = lines.length - 2; }
    let assetsIndex = lines.findIndex((l, i) => i > flutterIndex && l.match(/^ {2}assets:/));
    if (assetsIndex === -1) { lines.splice(flutterIndex + 1, 0, '  assets:'); assetsIndex = flutterIndex + 1; }

    const existingEntries = lines.map(l => l.trim());
    let addedCount = 0;
    for (const reqAsset of requiredAssets) {
        if (!existingEntries.includes(reqAsset)) {
            lines.splice(assetsIndex + 1 + addedCount, 0, `    ${reqAsset}`);
            addedCount++;
        }
    }

    const newLines = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- assets/') && trimmed.split('/').length > 2) {
            let dirPathStr = trimmed.replace(/^- /, '').replace(/['"]/g, '').trim(); 
            return fs.existsSync(path.join(rootPath, dirPathStr));
        }
        return true;
    });
    fs.writeFileSync(pubspecPath, newLines.join('\n'));
}

export function deactivate() {
    if (syncTimer) {
        clearTimeout(syncTimer);
    }
}