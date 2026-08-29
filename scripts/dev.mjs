import { spawn } from 'node:child_process'

const root = process.cwd()
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function getSpawnSpec(command, args) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) {
    return { command, args }
  }

  // Windows cannot spawn .cmd files directly through Node's CreateProcess.
  // Route pnpm.cmd through cmd.exe to avoid spawn EINVAL.
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  }
}

const processes = [
  {
    name: 'api',
    command: 'cargo',
    args: ['run', '--manifest-path', 'services/api/Cargo.toml'],
  },
  {
    name: 'admin',
    command: pnpm,
    args: ['--filter', '@bookmark-vault/admin-web', 'dev'],
  },
].map(({ name, command, args }) => {
  const spawnSpec = getSpawnSpec(command, args)

  return {
    name,
    child: spawn(spawnSpec.command, spawnSpec.args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      windowsHide: true,
    }),
  }
})

let shuttingDown = false

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('close', resolve)
      killer.once('error', resolve)
    })
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  return Promise.resolve()
}

async function shutdown(exitCode) {
  if (shuttingDown) return
  shuttingDown = true
  await Promise.all(processes.map(({ child }) => stopChild(child)))
  process.exit(exitCode)
}

for (const { name, child } of processes) {
  child.once('error', (error) => {
    console.error(`[${name}] ${error.message}`)
    console.error(`[dev] ${name} 启动失败；其他开发服务继续运行。修复后请重新执行 pnpm dev。`)
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    if (code !== 0 || signal) {
      console.error(`[${name}] exited with code ${code ?? 'signal ' + signal}`)
      console.error(`[dev] ${name} 服务已退出；其他开发服务继续运行。修复后请重新执行 pnpm dev。`)
      process.exitCode = code ?? 1
    } else {
      console.log(`[dev] ${name} 服务已正常退出；其他开发服务继续运行。`)
    }
  })
}

process.once('SIGINT', () => void shutdown(130))
process.once('SIGTERM', () => void shutdown(143))

console.log('开发服务已启动：API、管理后台。侧边栏需要时单独执行 pnpm dev:sidebar。')
