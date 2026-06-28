#!/usr/bin/env python3
import json
import socket
import threading
import tkinter as tk
import webbrowser
import sys
from pathlib import Path
from tkinter import messagebox, ttk

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

import server

APP_TITLE = "洛克王国PVP Webui 启动器"
DEFAULT_CONFIG = {"port": server.DEFAULT_PORT}


def get_app_dir() -> Path:
    try:
        return server.DATA_DIR
    except Exception as e:
        print(f"获取数据目录失败: {e}", file=sys.stderr)
        # 回退到脚本所在目录
        return Path(__file__).resolve().parent


APP_DIR = get_app_dir()
CONFIG_PATH = APP_DIR / "config.json"


def load_config():
    if not CONFIG_PATH.exists():
        return DEFAULT_CONFIG.copy()
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_CONFIG.copy()
    port = data.get("port", server.DEFAULT_PORT)
    if not isinstance(port, int):
        port = server.DEFAULT_PORT
    return {"port": port}


def save_config(port: int):
    APP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps({"port": port}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def can_bind_port(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


class LauncherApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("460x290")
        self.root.resizable(False, False)

        self.server_instance = None
        self.server_thread = None
        self.running_port = None

        config = load_config()
        self.port_var = tk.StringVar(value=str(config["port"]))
        self.status_var = tk.StringVar(value="未启动")

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _build_ui(self):
        frame = ttk.Frame(self.root, padding=18)
        frame.pack(fill="both", expand=True)

        title = ttk.Label(frame, text=APP_TITLE, font=("Microsoft YaHei UI", 14, "bold"))
        title.pack(anchor="w", pady=(0, 12))

        desc = ttk.Label(
            frame,
            text="设置本地端口后启动服务，可直接打开管理页、实时控制页或展示页。",
            justify="left",
        )
        desc.pack(anchor="w", pady=(0, 16))

        port_row = ttk.Frame(frame)
        port_row.pack(fill="x", pady=(0, 12))

        ttk.Label(port_row, text="服务端口:").pack(side="left")
        self.port_spinbox = ttk.Spinbox(
            port_row,
            from_=1024,
            to=65535,
            textvariable=self.port_var,
            width=12,
            justify="center",
        )
        self.port_spinbox.pack(side="left", padx=(8, 12))

        ttk.Button(port_row, text="保存端口", command=self.save_port_only).pack(side="left")

        status_frame = ttk.LabelFrame(frame, text="当前状态", padding=12)
        status_frame.pack(fill="x", pady=(0, 14))
        ttk.Label(status_frame, textvariable=self.status_var).pack(anchor="w")

        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill="x")

        ttk.Button(btn_frame, text="启动服务", command=self.start_service).grid(row=0, column=0, padx=4, pady=4, sticky="ew")
        ttk.Button(btn_frame, text="停止服务", command=self.stop_service).grid(row=0, column=1, padx=4, pady=4, sticky="ew")
        ttk.Button(btn_frame, text="打开管理页", command=self.open_admin).grid(row=1, column=0, padx=4, pady=4, sticky="ew")
        ttk.Button(btn_frame, text="打开展示页", command=self.open_main).grid(row=1, column=1, padx=4, pady=4, sticky="ew")
        ttk.Button(btn_frame, text="打开实时控制页", command=self.open_live_control).grid(row=2, column=0, columnspan=2, padx=4, pady=4, sticky="ew")

        btn_frame.columnconfigure(0, weight=1)
        btn_frame.columnconfigure(1, weight=1)

        tip = ttk.Label(
            frame,
            text="提示: 启动时会先检测端口是否被占用，成功后自动打开管理页。",
            foreground="#666666",
            justify="left",
        )
        tip.pack(anchor="w", pady=(16, 0))

    def set_status(self, message: str):
        self.status_var.set(message)

    def get_port(self):
        value = self.port_var.get().strip()
        try:
            port = int(value)
        except ValueError:
            raise ValueError("端口必须是数字")
        if port < 1 or port > 65535:
            raise ValueError("端口范围必须在 1 到 65535 之间")
        return port

    def base_url(self):
        port = self.running_port if self.running_port else self.get_port()
        return f"http://127.0.0.1:{port}"

    def save_port_only(self):
        try:
            port = self.get_port()
            save_config(port)
        except ValueError as exc:
            messagebox.showerror(APP_TITLE, str(exc))
            return
        self.set_status(f"端口已保存为 {port}")

    def start_service(self):
        if self.server_instance is not None:
            self.set_status(f"服务已运行: http://127.0.0.1:{self.running_port}")
            self.open_admin()
            return

        try:
            port = self.get_port()
        except ValueError as exc:
            messagebox.showerror(APP_TITLE, str(exc))
            return

        if not can_bind_port(port):
            messagebox.showwarning(APP_TITLE, f"端口 {port} 已被占用，请更换端口后重试。")
            self.set_status(f"端口 {port} 已被占用")
            return

        try:
            self.server_instance = server.create_server(port=port, host="127.0.0.1")
        except OSError as exc:
            self.server_instance = None
            messagebox.showerror(APP_TITLE, f"启动服务失败: {exc}")
            self.set_status(f"启动失败: {exc}")
            return

        self.server_thread = threading.Thread(
            target=self.server_instance.serve_forever,
            name="webui-server-thread",
            daemon=True,
        )
        self.server_thread.start()
        self.running_port = port
        save_config(port)
        self.set_status(f"服务运行中: http://127.0.0.1:{port}")
        webbrowser.open(f"{self.base_url()}/admin.html")

    def stop_service(self):
        if self.server_instance is None:
            self.set_status("服务未启动")
            return

        self.server_instance.shutdown()
        self.server_instance.server_close()
        if self.server_thread is not None:
            self.server_thread.join(timeout=2)

        self.server_instance = None
        self.server_thread = None
        stopped_port = self.running_port
        self.running_port = None
        self.set_status(f"服务已停止，原端口 {stopped_port}")

    def ensure_running(self):
        if self.server_instance is None:
            should_start = messagebox.askyesno(APP_TITLE, "服务尚未启动，是否现在启动？")
            if not should_start:
                return False
            self.start_service()
        return self.server_instance is not None

    def open_admin(self):
        if not self.ensure_running():
            return
        webbrowser.open(f"{self.base_url()}/admin.html")

    def open_main(self):
        if not self.ensure_running():
            return
        webbrowser.open(self.base_url())

    def open_live_control(self):
        if not self.ensure_running():
            return
        webbrowser.open(f"{self.base_url()}/live-control.html")

    def on_close(self):
        if self.server_instance is not None:
            self.stop_service()
        self.root.destroy()


def main():
    APP_DIR.mkdir(parents=True, exist_ok=True)
    try:
        root = tk.Tk()
    except Exception as e:
        print(f"初始化 tkinter 失败: {e}", file=sys.stderr)
        print("可能的原因: Python 未安装 tkinter 支持，或 DISPLAY 环境变量未设置", file=sys.stderr)
        input("按回车键退出...")
        sys.exit(1)
    if hasattr(root, "tk") and root.tk.call("tk", "windowingsystem") == "win32":
        try:
            root.iconbitmap(default="")
        except tk.TclError:
            pass
    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")
    app = LauncherApp(root)
    app.set_status(f"默认端口: {load_config()['port']}")
    root.mainloop()


if __name__ == "__main__":
    main()
