"""Exercise the built CLI through a real POSIX terminal, including keyboard Ctrl+C."""

import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import struct
import tempfile
import termios
import time

REPOSITORY = Path(__file__).resolve().parent.parent
CLI = REPOSITORY / "bin/jh4j.js"
FIXTURE = REPOSITORY / "tests/fixtures/pc"


def execute(root, arguments, actions=(), columns=80):
    pid, descriptor = pty.fork()
    if pid == 0:
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 24, columns, 0, 0))
        os.chdir(root)
        os.environ.pop("CI", None)
        os.environ["NO_COLOR"] = "1"
        os.environ["TERM"] = "xterm-256color"
        os.environ["JH4J_HOME"] = str(root / "home")
        os.execvp("node", ["node", str(CLI), *arguments])
    output = b""
    step = 0
    readable = True
    deadline = time.monotonic() + 15
    try:
        while time.monotonic() < deadline:
            if readable and select.select([descriptor], [], [], 0.05)[0]:
                try:
                    data = os.read(descriptor, 65536)
                    output += data
                    readable = bool(data)
                except OSError:
                    readable = False
            elif not readable:
                time.sleep(0.02)
            if step < len(actions) and actions[step][0] in output.decode(errors="replace"):
                time.sleep(0.1)
                if isinstance(actions[step][1], bytes):
                    os.write(descriptor, actions[step][1])
                else:
                    os.kill(pid, actions[step][1])
                step += 1
            exited, status = os.waitpid(pid, os.WNOHANG)
            if exited:
                return os.waitstatus_to_exitcode(status), output.decode(errors="replace")
        os.kill(pid, signal.SIGTERM)
        time.sleep(0.3)
        exited, _ = os.waitpid(pid, os.WNOHANG)
        if not exited:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        raise AssertionError("Terminal test timed out:\n" + output.decode(errors="replace")[-2000:])
    finally:
        os.close(descriptor)


with tempfile.TemporaryDirectory(prefix="jh4j-terminal-") as directory:
    root = Path(directory)
    source = root / "template"
    shutil.copytree(FIXTURE, source)
    setup = source / "scripts/setup-project.mjs"
    original = setup.read_text()
    setup.write_text("await new Promise(resolve=>setTimeout(resolve,10000));\n" + original)
    common = ["--template", "web.jh4j-mf-remote", "--source", str(source), "--skip-git"]

    code, output = execute(root, ["create", "cancelled", "--yes", *common], [("正在生成项目文件", b"\x03")])
    assert code == 130, (code, output)
    assert not (root / "cancelled").exists()
    assert not any(".jh4j-tmp-" in entry.name or entry.name.endswith(".jh4j-lock") for entry in root.iterdir())
    print("PASS: keyboard Ctrl+C during spinner exits 130 and cleans staging")

    setup.write_text(original)
    code, output = execute(root, ["create", *common], [("选择创建方式", b"\r"), ("项目名称", b"\r")])
    assert code == 0, (code, output)
    assert (root / "jh4j-ui-app/.jhlc/project.json").exists()
    print("PASS: quick creation accepts the editable Manifest default")

    code, output = execute(root, ["create", "--source", str(source)], [("选择项目模板", b"\x03")])
    assert code == 130, (code, output)
    print("PASS: keyboard Ctrl+C during template selection exits 130")

    code, output = execute(root, ["create", "--source", str(source)], [("选择项目模板", signal.SIGTERM)])
    assert code == 143, (code, output)
    print("PASS: SIGTERM during an active prompt exits 143")

    code, output = execute(root, ["create", "narrow", "--yes", *common], columns=30)
    assert code == 0, (code, output)
    assert "NEXT STEPS" not in output
    print("PASS: narrow terminal uses plain completion without panel errors")

    code, output = execute(root, ["create", "custom", *common, "--customize", "--module", "billing", "--title", "Billing", "--port", "8123"], [("本地联调地址", b"\r")])
    assert code == 0, (code, output)
    assert "选择创建方式" not in output and "模块标识" not in output and "应用标题" not in output
    config = json.loads((root / "custom/project.config.json").read_text())
    assert config["moduleName"] == "billing" and config["devServerPort"] == 8123
    print("PASS: custom creation skips already supplied fields")
