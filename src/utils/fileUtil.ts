import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OutputChannel } from "../outputChannel";
import { execSync } from 'child_process';

export class FileUtil {
    private static readonly WIN32_HOST_PATH: string = "C:\\Windows\\System32\\drivers\\etc\\hosts";
    private static readonly MAC_HOST_PATH: string = "/etc/hosts";
    private static readonly META_FILE_NAME: string = "meta.json";

    public static elevatedWriteFileSync(filePath, content) {
        try {
            // 先尝试普通写入
            fs.writeFileSync(filePath, content);
        } catch (err) {
            // 无权限时自动触发提权流程
            const tempFile = path.join(os.tmpdir(), `vscode-liveHost-${Date.now()}.tmp`);
            fs.writeFileSync(tempFile, content);

            try {
                // TODO: 因为本人在win平台，只测了这个平台，如果其他平台有问题，可以自行测试修复。
                switch (os.platform()) {
                    case 'win32':
                        // Windows 完全静默方案
                        execSync(
                            `Start-Process -Verb RunAs -WindowStyle Hidden -FilePath 'powershell' -ArgumentList '-Command', 'copy \"${tempFile}\" \"${filePath}\"'`,
                            { stdio: 'ignore', shell: "powershell" }
                        );
                        break;

                    case 'darwin':
                        // macOS 使用 osascript 显示图形化提权
                        execSync(
                            `osascript -e "do shell script \\"cp ${tempFile} ${filePath}\\" with administrator privileges"`,
                            { stdio: 'ignore' }
                        );
                        break;

                    case 'linux':
                        // Linux 使用 pkexec 图形化提权
                        execSync(
                            `pkexec cp ${tempFile} ${filePath}`,
                            { stdio: 'ignore' }
                        );
                        break;

                    default:
                        throw new Error('Unsupported platform');
                }
            } catch (sudoErr) {
                throw new Error(`提权失败: ${sudoErr.message}`);
            } finally {
                fs.unlinkSync(tempFile);
            }
        }
    }

    public static createDefaultHostFloder(appRoot: string) {
        OutputChannel.appendLine(`Ready to create ${path.join(appRoot, '.host')}`);
        fs.mkdirSync(path.join(appRoot, '.host'));
        // create current host file
        const osType = os.platform();
        let sysHostPath = osType.indexOf('win32') > -1 ? this.WIN32_HOST_PATH : this.MAC_HOST_PATH;
        let data = fs.readFileSync(sysHostPath);

        this.elevatedWriteFileSync(path.join(appRoot, '.host', 'default.host'), data);
        // set default choose host
        this.elevatedWriteFileSync(path.join(appRoot, '.host', this.META_FILE_NAME), JSON.stringify(
            { cur: ['default'] }
        ));

        OutputChannel.appendLine(`Create ${path.join(appRoot, '.host')} success`);
    }

    public static createHostFile(appRoot: string, name: string) {
        this.elevatedWriteFileSync(path.join(appRoot, '.host', `${name}.host`), ``);
    }

    public static renameHostFile(appRoot: string, oldname: string, name: string) {
        fs.renameSync(path.join(appRoot, '.host', `${oldname}.host`), path.join(appRoot, '.host', `${name}.host`));
    }

    public static getMetaInfo(appRoot: string): any {
        var metaData = fs.readFileSync(path.join(appRoot, '.host', this.META_FILE_NAME));
        return JSON.parse(metaData.toString());
    }

    public static setMetaInfo(appRoot: string, data: any): void {
        this.elevatedWriteFileSync(path.join(appRoot, '.host', this.META_FILE_NAME), JSON.stringify(data));
    }

    public static delHostFile(appRoot: string, item: any) {
        // del metainfo
        let metaInfo = this.getMetaInfo(appRoot);
        let curLabelIndex = metaInfo.cur.indexOf(path.basename(item.label, '.host'));

        if (metaInfo.cur && curLabelIndex > -1) {
            metaInfo.cur.splice(curLabelIndex, 1);
            this.setMetaInfo(appRoot, metaInfo);
        }

        if (fs.existsSync(item.filePath)) {
            fs.unlinkSync(item.filePath);
        }
    }

    public static gethostConfigFileList(appRoot: string): any {
        OutputChannel.appendLine(`Ready to get usefull host config from : ${path.join(appRoot, '.host')} floder.`);
        let hostFiles: string[] = fs.readdirSync(path.join(appRoot, '.host'));
        let usefullHostFiles: string[] = new Array<string>();
        if (hostFiles && hostFiles.length > 0) {
            hostFiles.forEach((hostFile) => {
                let fileStats: fs.Stats = fs.statSync(path.join(appRoot, '.host', hostFile));
                if (fileStats.isFile() && hostFile !== this.META_FILE_NAME) {
                    usefullHostFiles.push(hostFile);
                }
            });
        }
        OutputChannel.appendLine(`Get usefull host config from : ${path.join(appRoot, '.host')} success`);
        return usefullHostFiles;
    }

    public static syncChooseHost(appRoot: string, metaInfo = null): any {
        const osType = os.platform();
        let sysHostPath = osType.indexOf('win32') > -1 ? this.WIN32_HOST_PATH : this.MAC_HOST_PATH;
        let data = '# LiveHost Manage this file, do not edit it manually';
        metaInfo = metaInfo ?? this.getMetaInfo(appRoot);
        let files = this.gethostConfigFileList(appRoot);
        if (files && files.length > 0) {
            files.forEach((file: any) => {
                if (metaInfo.cur.indexOf(path.basename(file, '.host')) > -1) {
                    let filePath = path.join(appRoot, '.host', file);
                    let curHostData = fs.readFileSync(filePath).toString();
                    data = data + `\n## host ${file} start\n` + curHostData + `\n# host ${file} end\n`;
                }
            });
        }
        this.elevatedWriteFileSync(sysHostPath, data);

        OutputChannel.appendLine(`syncChooseHost: ${metaInfo.cur.join(',')}success`);
    }
    public static pathExists(p: string): boolean {
        try {
            fs.accessSync(p);
        } catch (err) {
            return false;
        }

        return true;
    }
}