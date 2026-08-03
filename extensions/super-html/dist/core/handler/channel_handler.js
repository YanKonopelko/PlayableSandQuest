"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jszip = __importStar(require("jszip"));
const utils_1 = __importDefault(require("../common/utils"));
const config_1 = __importDefault(require("../config/config"));
const platform_1 = __importDefault(require("../common/platform"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class channel_handler {
    async run() {
        const s_out_dir = config_1.default.s_out_dir;
        const d_hot = config_1.default.d_hot;
        const d_super_html_settings = this._get_settings();
        // #### 资源 
        //导入不带压缩的资源
        const s_res_body = `window.__res=${JSON.stringify(d_hot.d_res_cache)};`;
        // #### 带压缩的资源
        let s_zip_res_body = "";
        {
            //导入带压缩的zip资源 
            // 
            if (d_hot.s_out_res_zip_base64) {
                s_zip_res_body += `window.__zip = "${d_hot.s_out_res_zip_base64}";`;
                //导入库
                s_zip_res_body += this._get_zip_script();
            }
            //导入常规资源 
            s_zip_res_body += `window.__res=${JSON.stringify(d_hot.d_out_res_no_zip)};`;
        }
        const inject_channel_adapter = config_1.default.inject_channel_adapter;
        for (let key in inject_channel_adapter) {
            let d_channel = inject_channel_adapter[key];
            const s_channel_name = d_channel.s_name;
            const s_channel_config_name = d_channel.s_config_name || s_channel_name;
            const s_build_key = this._get_build_key(d_channel);
            if (!d_channel.b_enable) {
                continue;
            }
            // #### 通用脚本
            const s_common_body = this._get_common_script(s_channel_name);
            // 有配置是生成zip
            d_channel.b_out_zip = d_channel.b_out_zip || false;
            // 是否开启html压缩
            d_channel.b_html_compression = d_channel.b_html_compression || false;
            // zip内的html名
            const s_zip_html_name = d_channel.s_html_name || "index.html";
            // html文件名
            var s_html_name = d_channel.s_html_name;
            {
                if (s_html_name) {
                    s_html_name = `${s_channel_name}_${s_html_name}.html`;
                }
                else {
                    s_html_name = `${s_channel_name}.html`;
                }
                if (d_hot.s_title) {
                    s_html_name = `${d_hot.s_title}_${s_html_name}`;
                }
                s_html_name = this._get_output_name(d_super_html_settings, s_build_key, "html", s_html_name);
            }
            // zip文件名
            var s_zip_name = d_channel.s_zip_name;
            {
                if (s_zip_name) {
                    s_zip_name = `${s_channel_name}_${s_zip_name}.zip`;
                }
                else {
                    s_zip_name = `${s_channel_name}.zip`;
                }
                if (d_hot.s_title) {
                    s_zip_name = `${d_hot.s_title}_${s_zip_name}`;
                }
                s_zip_name = this._get_output_name(d_super_html_settings, s_build_key, "zip", s_zip_name);
            }
            // #### 渠道脚本
            let s_channel_meta = this._get_channel_script(s_channel_config_name, "meta.html");
            if (s_channel_name == "unity") {
                // unity 需要设置商店地址，脚本被压缩或混淆了，需要提取出来给平台正则匹配
                if (config_1.default.d_hot.s_unity_inject_html) {
                    if (s_channel_meta) {
                        s_channel_meta = config_1.default.d_hot.s_unity_inject_html + "\n" + s_channel_meta;
                    }
                    else {
                        s_channel_meta = config_1.default.d_hot.s_unity_inject_html;
                    }
                }
            }
            const s_channel_head = this._get_channel_script(s_channel_config_name, "head.js");
            const s_to_store_body = this._get_to_store_script(s_channel_config_name, s_channel_name);
            const s_channel_body = this._get_channel_script(s_channel_config_name, "script.js");
            let s_out_body = null;
            let l_body = [];
            if (d_channel.b_html_compression) {
                //分割资源的话，就不打进html，且只有zip下生效
                if (d_channel.b_split_res) {
                    l_body = [s_to_store_body, s_channel_body, s_common_body];
                }
                else {
                    l_body = [s_to_store_body, s_channel_body, s_zip_res_body, s_common_body];
                }
            }
            else {
                l_body = [s_to_store_body, s_channel_body, s_res_body, s_common_body];
            }
            s_out_body = l_body.join("\n");
            let s_html_content = this._add_meta_to_meta(d_hot.s_base_html_content, s_channel_meta);
            s_html_content = this._add_script_to_head(s_html_content, s_channel_head);
            s_html_content = this._add_script_to_body(s_html_content, s_out_body);
            let s_out_file_name = "";
            let out_data = null;
            // console.log(d_channel)
            if (d_channel.b_out_zip) {
                s_out_file_name = s_zip_name;
                //生成zip的文件，使用不带压缩的
                s_out_body = s_html_content;
                var zip = new jszip.default();
                {
                    if (d_channel.b_split_res) {
                        //资源分割
                        zip.file("res.js", s_zip_res_body, { compression: "DEFLATE" });
                        s_out_body = this._add_meta_to_meta(s_out_body, "<script src='res.js'></script>");
                    }
                }
                {
                    //是否有config.json 文件 pangle渠道有
                    const s_config_json_name = "config.json";
                    const s_config_json = this._get_channel_script(s_channel_config_name, s_config_json_name);
                    if (s_config_json) {
                        zip.file(s_config_json_name, s_config_json, { compression: "DEFLATE" });
                        //特殊的渠道适配
                        {
                            var d_config = JSON.parse(s_config_json);
                            var thumbnailName = d_config.thumbnailName;
                            if (thumbnailName) {
                                const s_file = path_1.default.join(config_1.default.s_input_dir, thumbnailName);
                                if (fs_1.default.existsSync(s_file)) {
                                    var data = platform_1.default.read_file(s_file);
                                    if (data) {
                                        zip.file(thumbnailName, data, { compression: "DEFLATE" });
                                    }
                                    else {
                                        utils_1.default.log(`[${s_channel_config_name}]:${thumbnailName} read fail`);
                                    }
                                }
                                else {
                                    utils_1.default.log(`[${s_channel_config_name}] : ${thumbnailName} no find`);
                                }
                            }
                        }
                    }
                }
                zip.file(s_zip_html_name, s_out_body, { compression: "DEFLATE" });
                // 生成更新后的zip文件
                out_data = await zip.generateAsync({
                    type: 'nodebuffer',
                    compression: "DEFLATE",
                    // compressionOptions: {
                    //     level: 5
                    // }
                });
            }
            else {
                s_out_file_name = s_html_name;
                out_data = s_html_content;
            }
            let s_out_path = platform_1.default.join(s_out_dir, s_channel_name, s_out_file_name);
            platform_1.default.writeFileSync(s_out_path, out_data);
            utils_1.default.log(`[${s_channel_name}] [${utils_1.default.b_to_kb(out_data.length)}] \n${s_out_path}`);
        }
    }
    _add_meta_to_meta(s_html_content, s_content) {
        if (!s_content)
            return s_html_content;
        return s_html_content.replace("<style>", () => `${s_content}\n<style>`);
    }
    _add_script_to_head(s_html_content, s_content) {
        if (!s_content)
            return s_html_content;
        s_content = `<script type="text/javascript">\n${s_content}\n</script>`;
        return s_html_content.replace("</head>", () => `${s_content}\n</head>`);
    }
    _add_script_to_body(s_html_content, s_content) {
        if (!s_content)
            return s_html_content;
        s_content = `<script type="text/javascript">\n${s_content}\n</script>`;
        return s_html_content.replace("</body>", () => `${s_content}\n</body>`);
    }
    //获得压缩库脚本
    _get_zip_script() {
        return utils_1.default.get_json(config_1.default.constants.inject_jszip_script);
    }
    //获得通用脚本 
    _get_common_script(s_channel_name) {
        const s_base = `window.super_html_channel = "${s_channel_name}";`;
        const s_pre_load_script = `window.super_pre_load_script = ${JSON.stringify(config_1.default.d_hot.l_pre_load_script)};`;
        // #### 各个版本适配文件
        const s_version_adapter_body = utils_1.default.get_json(config_1.default.constants.inject_version_adapter[config_1.default.version]);
        const s_common = utils_1.default.get_json(config_1.default.constants.inject_common_script);
        return s_base + s_pre_load_script + s_version_adapter_body + s_common;
    }
    //获得渠道脚本 
    _get_channel_script(s_channel_name, s_file_name) {
        // 有配置脚本
        let s_script_path = `channel/${s_channel_name}/${s_file_name}`;
        const s_disk_path = path_1.default.join(__dirname, "../config", s_script_path);
        if (fs_1.default.existsSync(s_disk_path)) {
            return fs_1.default.readFileSync(s_disk_path, "utf8");
        }
        const s_content = utils_1.default.get_json(s_script_path);
        return s_content || "";
    }
    _get_to_store_script(s_channel_config_name, s_channel_name) {
        const s_to_store_body = this._get_channel_script(s_channel_config_name, "to_store.js") ||
            this._get_channel_script(s_channel_name, "to_store.js");
        if (s_to_store_body) {
            return s_to_store_body;
        }
        return `window.ToStore = function(auto = false) {
    super_log("ToStore " + window.super_html_channel);
    if (window.super_html && typeof window.super_html.download === "function") {
        window.super_html.download();
    }
};`;
    }
    _get_settings_path() {
        const project_path = (global["Editor"] && ((Editor.Project && Editor.Project.path) || Editor.projectPath)) || "";
        if (!project_path) {
            return "";
        }
        return path_1.default.join(project_path, "settings", "super-html.json");
    }
    _get_settings() {
        const s_settings_path = this._get_settings_path();
        if (!s_settings_path || !fs_1.default.existsSync(s_settings_path)) {
            return {};
        }
        try {
            return JSON.parse(fs_1.default.readFileSync(s_settings_path, "utf8"));
        }
        catch (error) {
            utils_1.default.warn("read settings/super-html.json fail", error.message);
            return {};
        }
    }
    _get_build_key(d_channel) {
        const s_channel_name = d_channel.s_name;
        const s_channel_config_name = d_channel.s_config_name || s_channel_name;
        const s_variant = d_channel.s_zip_name || d_channel.s_html_name || "";
        const s_type = d_channel.b_out_zip ? "zip" : "html";
        return [s_channel_config_name, s_variant, s_type].filter(Boolean).join("__");
    }
    _get_output_name(d_settings, s_build_key, s_ext, s_default_name) {
        const d_build_names = d_settings.build_names || {};
        const s_custom_name = d_build_names[s_build_key];
        if (!s_custom_name || !String(s_custom_name).trim()) {
            return s_default_name;
        }
        const s_clean_name = String(s_custom_name).trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
        return s_clean_name.toLowerCase().endsWith(`.${s_ext}`) ? s_clean_name : `${s_clean_name}.${s_ext}`;
    }
}
exports.default = new channel_handler();
