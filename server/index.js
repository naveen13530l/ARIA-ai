import express from 'express'
import cors from 'cors'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const execAsync = promisify(exec)
const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// NVIDIA NIM client (OpenAI-compatible)
const nvidiaClient = process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY !== 'YOUR_NVIDIA_API_KEY_HERE'
  ? new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    })
  : null

function resolvePath(p) {
  if (!p) return os.homedir()
  if (p === '~' || p.startsWith('~/')) return p.replace('~', os.homedir())
  if (path.isAbsolute(p)) return p
  return path.join(os.homedir(), p)
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

async function listFiles(dirPath, showHidden = false) {
  const resolved = resolvePath(dirPath)
  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    const results = []
    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) continue
      try {
        const fullPath = path.join(resolved, entry.name)
        const stat = await fs.stat(fullPath)
        results.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? formatFileSize(stat.size) : null,
          modified: stat.mtime.toLocaleDateString(),
          ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : null
        })
      } catch (e) {
        results.push({ name: entry.name, type: 'unknown' })
      }
    }
    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return { path: resolved, entries: results, count: results.length }
  } catch (err) {
    return { error: `Cannot access directory: ${err.message}` }
  }
}

async function findFile(filename, searchDir) {
  const resolved = resolvePath(searchDir || '~')
  try {
    let cmd
    if (process.platform === 'win32') {
      cmd = `where /r "${resolved}" *${filename}* 2>nul`
    } else {
      cmd = `find "${resolved}" -name "*${filename}*" -not -path "*/.*" 2>/dev/null | head -20`
    }
    const { stdout } = await execAsync(cmd, { timeout: 10000 })
    const files = stdout.trim().split('\n').filter(Boolean).slice(0, 20)
    return { found: files.length, files }
  } catch (err) {
    return { error: err.message }
  }
}

async function openFile(filePath) {
  const resolved = resolvePath(filePath)
  const platform = process.platform

  try {
    if (platform === 'win32') {
      spawn('explorer.exe', [resolved], { detached: true, stdio: 'ignore' })
    } else if (platform === 'darwin') {
      exec(`open "${resolved}"`)
    } else {
      exec(`xdg-open "${resolved}"`)
    }
    return { success: true, path: resolved, message: `Opened: ${path.basename(resolved)}` }
  } catch (err) {
    return { error: err.message }
  }
}

async function openApp(appName) {
  const platform = process.platform

  // Windows UWP/Store apps — launched via explorer.exe shell:AppsFolder\...
  const winUwpApps = {
    'instagram': 'Facebook.InstagramBeta_8xx8rvfyw5nnt!App',
    'whatsapp': 'WhatsApp',
    'telegram': 'Telegram',
    'netflix': 'Netflix',
  }

  const appMap = {
    'chrome': { mac: 'Google Chrome', win: 'chrome', linux: 'google-chrome' },
    'google chrome': { mac: 'Google Chrome', win: 'chrome', linux: 'google-chrome' },
    'firefox': { mac: 'Firefox', win: 'firefox', linux: 'firefox' },
    'safari': { mac: 'Safari', linux: 'safari' },
    'vscode': { mac: 'Visual Studio Code', win: 'code', linux: 'code' },
    'vs code': { mac: 'Visual Studio Code', win: 'code', linux: 'code' },
    'code': { mac: 'Visual Studio Code', win: 'code', linux: 'code' },
    'terminal': { mac: 'Terminal', win: 'cmd', linux: 'gnome-terminal' },
    'iterm': { mac: 'iTerm', linux: 'gnome-terminal' },
    'finder': { mac: 'Finder', win: 'explorer', linux: 'nautilus' },
    'files': { mac: 'Finder', win: 'explorer', linux: 'nautilus' },
    'explorer': { mac: 'Finder', win: 'explorer', linux: 'nautilus' },
    'spotify': { mac: 'Spotify', win: 'spotify:', linux: 'spotify' },
    'slack': { mac: 'Slack', win: 'slack:', linux: 'slack' },
    'discord': { mac: 'Discord', win: 'discord:', linux: 'discord' },
    'teams': { mac: 'Microsoft Teams', win: 'teams:', linux: 'teams' },
    'zoom': { mac: 'zoom.us', win: 'zoom:', linux: 'zoom' },
    'calculator': { mac: 'Calculator', win: 'calc', linux: 'gnome-calculator' },
    'notepad': { win: 'notepad' },
    'notes': { mac: 'Notes', win: 'notepad', linux: 'gedit' },
    'vlc': { mac: 'VLC', win: 'vlc', linux: 'vlc' },
    'brave': { mac: 'Brave Browser', win: 'brave', linux: 'brave-browser' },
    'postman': { mac: 'Postman', win: 'postman', linux: 'postman' },
    'figma': { mac: 'Figma', win: 'figma:', linux: 'figma-linux' },
    'notion': { mac: 'Notion', win: 'notion:', linux: 'notion-app' },
    'obsidian': { mac: 'Obsidian', win: 'obsidian:', linux: 'obsidian' },
    'telegram': { mac: 'Telegram', win: 'telegram:', linux: 'telegram-desktop' },
    'whatsapp': { mac: 'WhatsApp', win: 'whatsapp:', linux: 'whatsapp-desktop' },
    'instagram': { mac: 'Instagram', win: 'instagram:', linux: 'instagram' },
    'netflix': { mac: 'Netflix', win: 'netflix:', linux: 'netflix' },
    'word': { mac: 'Microsoft Word', win: 'WINWORD', linux: 'libreoffice' },
    'excel': { mac: 'Microsoft Excel', win: 'EXCEL', linux: 'libreoffice' },
    'powerpoint': { mac: 'Microsoft PowerPoint', win: 'POWERPNT', linux: 'libreoffice' },
    'outlook': { mac: 'Microsoft Outlook', win: 'OUTLOOK', linux: 'thunderbird' },
  }

  const key = appName.toLowerCase().trim()
  const entry = appMap[key]

  try {
    if (platform === 'darwin') {
      const macName = entry?.mac || appName
      exec(`open -a "${macName}"`)
    } else if (platform === 'win32') {
      // Check if this is a UWP/Store app first
      const uwpId = winUwpApps[key]
      if (uwpId) {
        spawn('explorer.exe', [`shell:AppsFolder\\${uwpId}`], { detached: true, stdio: 'ignore' })
      } else {
        const winName = entry?.win || appName
        if (winName.endsWith(':')) {
          spawn('cmd.exe', ['/c', 'start', winName], { detached: true, stdio: 'ignore', shell: true })
        } else {
          spawn('cmd.exe', ['/c', 'start', '""', winName], { detached: true, stdio: 'ignore', shell: true })
        }
      }
    } else {
      const linuxCmd = entry?.linux || appName.toLowerCase().replace(/\s+/g, '-')
      exec(`${linuxCmd} &`)
    }
    return { success: true, app: appName, message: `Launching ${appName}...` }
  } catch (err) {
    return { error: `Could not open ${appName}: ${err.message}` }
  }
}

async function moveFile(sourcePath, destDir) {
  const src = resolvePath(sourcePath)
  const dest = resolvePath(destDir)
  try {
    await fs.mkdir(dest, { recursive: true })
    const filename = path.basename(src)
    const destPath = path.join(dest, filename)
    await fs.rename(src, destPath)
    return { success: true, from: src, to: destPath }
  } catch (err) {
    return { error: err.message }
  }
}

async function organizeFolder(dirPath) {
  const resolved = resolvePath(dirPath)
  const typeMap = {
    'Images': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.heic', '.tiff', '.ico', '.raw'],
    'Videos': ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpeg'],
    'Audio': ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
    'Documents': ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.pages', '.md'],
    'Spreadsheets': ['.xls', '.xlsx', '.csv', '.ods', '.numbers'],
    'Presentations': ['.ppt', '.pptx', '.odp', '.key'],
    'Archives': ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
    'Code': ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml', '.sh', '.bash', '.sql', '.r', '.m'],
    'Executables': ['.exe', '.dmg', '.pkg', '.deb', '.rpm', '.app', '.appimage', '.msi'],
    'Fonts': ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
    '3D': ['.obj', '.fbx', '.stl', '.blend', '.3ds', '.dae'],
  }

  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    const moved = []
    const skipped = []

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue
      const ext = path.extname(entry.name).toLowerCase()
      let category = 'Other'
      for (const [cat, exts] of Object.entries(typeMap)) {
        if (exts.includes(ext)) { category = cat; break }
      }
      const destDir = path.join(resolved, category)
      await fs.mkdir(destDir, { recursive: true })
      const src = path.join(resolved, entry.name)
      const dest = path.join(destDir, entry.name)
      try {
        await fs.rename(src, dest)
        moved.push({ file: entry.name, category })
      } catch (e) {
        skipped.push(entry.name)
      }
    }

    const summary = moved.reduce((acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + 1
      return acc
    }, {})

    return {
      success: true,
      organized: moved.length,
      skipped: skipped.length,
      details: moved,
      summary
    }
  } catch (err) {
    return { error: err.message }
  }
}

async function createDirectory(dirPath) {
  const resolved = resolvePath(dirPath)
  try {
    await fs.mkdir(resolved, { recursive: true })
    return { success: true, path: resolved }
  } catch (err) {
    return { error: err.message }
  }
}

async function deleteFile(filePath) {
  const resolved = resolvePath(filePath)
  try {
    const stat = await fs.stat(resolved)
    if (stat.isDirectory()) {
      await fs.rm(resolved, { recursive: true })
    } else {
      await fs.unlink(resolved)
    }
    return { success: true, deleted: resolved }
  } catch (err) {
    return { error: err.message }
  }
}

async function getSystemInfo() {
  const info = {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpuCores: os.cpus().length,
    totalMemory: formatBytes(os.totalmem()),
    freeMemory: formatBytes(os.freemem()),
    usedMemory: formatBytes(os.totalmem() - os.freemem()),
    homeDir: os.homedir(),
    tempDir: os.tmpdir(),
  }
  
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption /format:csv')
      const lines = stdout.trim().split('\n').filter(l => l.trim())
      if (lines.length > 1) {
        const drives = lines.slice(1).map(line => {
          const parts = line.split(',')
          if (parts.length >= 4) {
            return {
              drive: parts[1],
              free: formatBytes(parseInt(parts[2]) || 0),
              total: formatBytes(parseInt(parts[3]) || 0)
            }
          }
          return null
        }).filter(Boolean)
        info.drives = drives
      }
    } else {
      const { stdout } = await execAsync('df -h / 2>/dev/null | tail -1')
      const parts = stdout.trim().split(/\s+/)
      if (parts.length >= 4) {
        info.disk = {
          total: parts[1],
          used: parts[2],
          available: parts[3],
          percent: parts[4]
        }
      }
    }
  } catch (e) {}
  
  return info
}

async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 15000 })
    return { success: true, output: stdout || stderr, error: stderr || null }
  } catch (err) {
    return { error: err.message }
  }
}

const TOOLS_FOR_GEMINI = [
  {
    functionDeclarations: [
      {
        name: 'list_files',
        description: 'List files and directories in a given path. Shows file names, types, sizes, and modification dates. Use when user wants to browse, see, or navigate their file system.',
        parameters: {
          type: 'OBJECT',
          properties: {
            path: { type: 'STRING', description: 'Directory path to list. Use ~ for home directory, or an absolute path.' },
            show_hidden: { type: 'BOOLEAN', description: 'Include hidden files (starting with .). Default is false.' }
          },
          required: ['path']
        }
      },
      {
        name: 'find_file',
        description: 'Search for files by name across the file system. Returns list of matching file paths.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filename: { type: 'STRING', description: 'Filename or partial name to search for (case-insensitive)' },
            search_dir: { type: 'STRING', description: 'Directory to start searching from. Defaults to home directory.' }
          },
          required: ['filename']
        }
      },
      {
        name: 'open_file',
        description: 'Open a file with the default system application. Use for documents, images, PDFs, etc.',
        parameters: {
          type: 'OBJECT',
          properties: {
            path: { type: 'STRING', description: 'Full path to the file to open' }
          },
          required: ['path']
        }
      },
      {
        name: 'open_app',
        description: 'Launch an application by name. Supports common apps like Chrome, VS Code, Spotify, etc.',
        parameters: {
          type: 'OBJECT',
          properties: {
            app_name: { type: 'STRING', description: 'Name of the application (e.g., "Chrome", "VS Code", "Spotify", "Notepad")' }
          },
          required: ['app_name']
        }
      },
      {
        name: 'move_file',
        description: 'Move a file from one location to another. Can also be used to rename files.',
        parameters: {
          type: 'OBJECT',
          properties: {
            source: { type: 'STRING', description: 'Source file path' },
            destination: { type: 'STRING', description: 'Destination directory or new file path' }
          },
          required: ['source', 'destination']
        }
      },
      {
        name: 'organize_folder',
        description: 'Automatically organize all files in a folder into subfolders by file type (Images, Videos, Documents, Code, etc.).',
        parameters: {
          type: 'OBJECT',
          properties: {
            path: { type: 'STRING', description: 'Path to the folder to organize' }
          },
          required: ['path']
        }
      },
      {
        name: 'create_directory',
        description: 'Create a new directory/folder.',
        parameters: {
          type: 'OBJECT',
          properties: {
            path: { type: 'STRING', description: 'Full path of the directory to create' }
          },
          required: ['path']
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file or directory. WARNING: This is destructive and cannot be undone.',
        parameters: {
          type: 'OBJECT',
          properties: {
            path: { type: 'STRING', description: 'Full path of the file or directory to delete' }
          },
          required: ['path']
        }
      },
      {
        name: 'get_system_info',
        description: 'Get comprehensive information about the system: OS, CPU, memory, disk space, hostname, etc.',
        parameters: {
          type: 'OBJECT',
          properties: {},
          required: []
        }
      },
      {
        name: 'run_command',
        description: 'Run a shell command and return the output. Use for system queries and diagnostics.',
        parameters: {
          type: 'OBJECT',
          properties: {
            command: { type: 'STRING', description: 'The shell command to execute' }
          },
          required: ['command']
        }
      }
    ]
  }
]

// OpenAI-compatible tool format for NVIDIA NIM
const TOOLS_FOR_OPENAI = TOOLS_FOR_GEMINI[0].functionDeclarations.map(fd => ({
  type: 'function',
  function: {
    name: fd.name,
    description: fd.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(fd.parameters.properties).map(([key, val]) => [
          key,
          { type: val.type.toLowerCase(), description: val.description }
        ])
      ),
      required: fd.parameters.required || []
    }
  }
}))

async function executeTool(name, input) {
  switch (name) {
    case 'list_files': return listFiles(input.path, input.show_hidden)
    case 'find_file': return findFile(input.filename, input.search_dir)
    case 'open_file': return openFile(input.path)
    case 'open_app': return openApp(input.app_name)
    case 'move_file': return moveFile(input.source, input.destination)
    case 'organize_folder': return organizeFolder(input.path)
    case 'create_directory': return createDirectory(input.path)
    case 'delete_file': return deleteFile(input.path)
    case 'get_system_info': return getSystemInfo()
    case 'run_command': return runCommand(input.command)
    default: return { error: `Unknown tool: ${name}` }
  }
}

app.get('/api/status', (req, res) => {
  res.json({ 
    apiKeySet: !!process.env.GEMINI_API_KEY, 
    secondaryKeySet: !!process.env.SECONDARY_GEMINI_API_KEY || !!process.env.GEMINI_API_KEY_2,
    nvidiaKeySet: !!nvidiaClient,
    platform: process.platform,
    version: '2.2.0 (Gemini + NVIDIA Fallback)'
  })
})

function getSystemPrompt(parameter) {
  const basePrompt = `You are **ARIA** (AI Resource & Intelligence Assistant), a professional AI assistant that helps users manage their computer and complete tasks efficiently.

## Current Context
- **Working Directory**: ${process.cwd()}
- **User's Home**: ${os.homedir()}
- **Operating System**: ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'}
- **Current Time**: ${new Date().toLocaleString()}

## Your Capabilities
You have access to tools that let you:
1. **list_files** - Browse and navigate the file system
2. **find_file** - Search for files by name
3. **open_file** - Open files with default applications
4. **open_app** - Launch applications
5. **move_file** - Move or rename files
6. **organize_folder** - Automatically sort files into categories
7. **create_directory** - Create new folders
8. **delete_file** - Delete files (use with caution)
9. **get_system_info** - Get system information
10. **run_command** - Execute shell commands

## Response Guidelines

### When to use tools:
- User asks to browse files → use list_files
- User asks to find something → use find_file
- User says "open", "launch", "start", "run" an app → use open_app
- User wants to organize files → use organize_folder
- User asks about their system → use get_system_info
- User asks to move/rename files → use move_file

### Response Style (based on parameter):
**${parameter || 'Balanced'}**:
- Be concise and actionable
- Use markdown formatting for clarity
- List items when showing multiple things
- Highlight important information with **bold**
- Use code blocks for technical output

### Important Rules:
1. ALWAYS use tools when the user asks for file operations, app launching, or system info
2. NEVER make up file contents or directory listings - always use list_files
3. For file operations, confirm paths are correct before executing
4. Be careful with delete operations - warn user of consequences
5. Format output clearly with markdown (headers, lists, code blocks)
6. If a tool fails, explain what happened and suggest alternatives
7. Keep responses focused and avoid unnecessary verbosity

## Example Responses:

**Listing files:**
Here's what I found in your Documents folder:
- 📁 Projects
- 📁 Work
- 📄 resume.pdf
- 📄 notes.txt

**Opening an app:**
Launching VS Code now... [executes open_app]

**System info:**
**System Information:**
- OS: Windows 11
- CPU: 8 cores
- RAM: 16 GB (8.2 GB available)
- Disk: 512 GB (234 GB free)

**Error handling:**
I couldn't access that directory. This might be because:
- The folder doesn't exist
- You don't have permission to access it
- The path might be incorrect

Would you like me to try a different path?`

  return basePrompt
}

async function handleGeminiChat(apiKey, messages, currentDir, parameter, modelName = 'gemini-2.0-flash', imageData = null) {
  const genAI_instance = new GoogleGenerativeAI(apiKey)
  
  const modelConfig = {
    model: modelName,
    systemInstruction: getSystemPrompt(parameter),
  }
  
  if (!imageData) {
    modelConfig.tools = TOOLS_FOR_GEMINI
  }
  
  const model = genAI_instance.getGenerativeModel(modelConfig)

  const recentMessages = messages.length > 11 ? messages.slice(-11, -1) : messages.slice(0, -1)
  // Filter out messages that contain tool execution markers to prevent
  // "function response turn must come after function call" errors.
  // These messages were created by previous tool-call interactions and
  // cannot be replayed as simple text history.
  const cleanMessages = recentMessages.filter(m => {
    if (!m.content) return false
    // Skip messages that look like tool outputs or tool-call summaries
    if (m.role === 'assistant' && (
      m.content.includes('functionCall') ||
      m.content.includes('functionResponse') ||
      (m.toolResults && m.toolResults.length > 0)
    )) return false
    return true
  })
  // Ensure history alternates user/model — Gemini requires strict alternation
  const geminiHistory = []
  let lastRole = null
  for (const m of cleanMessages) {
    const role = m.role === 'assistant' ? 'model' : 'user'
    if (role === lastRole) {
      // Merge consecutive same-role messages
      geminiHistory[geminiHistory.length - 1].parts[0].text += '\n' + m.content
    } else {
      geminiHistory.push({ role, parts: [{ text: m.content }] })
      lastRole = role
    }
  }
  // Gemini requires history to start with 'user' role
  if (geminiHistory.length > 0 && geminiHistory[0].role !== 'user') {
    geminiHistory.shift()
  }

  const chat = model.startChat({ history: geminiHistory })
  
  const lastMessage = messages[messages.length - 1]
  let contentParts = [{ text: lastMessage.content }]
  
  if (imageData) {
    const base64Data = imageData.split(',')[1]
    const mimeType = imageData.split(';')[0].replace('data:', '')
    contentParts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data
      }
    })
  }
  
  let toolResults = []
  let finalContent = ''

  let result = await chat.sendMessage(contentParts)
  let response = result.response

  let iterations = 0
  const maxIterations = 10

  while (iterations < maxIterations) {
    iterations++
    const candidate = response.candidates?.[0]
    if (!candidate) break

    const parts = candidate.content?.parts || []
    const functionCalls = parts.filter(p => p.functionCall)

    if (functionCalls.length === 0) {
      finalContent = parts.filter(p => p.text).map(p => p.text).join('\n')
      break
    }

    const functionResponses = []
    for (const fc of functionCalls) {
      try {
        const toolResult = await executeTool(fc.functionCall.name, fc.functionCall.args)
        functionResponses.push({
          functionResponse: { name: fc.functionCall.name, response: toolResult }
        })
        toolResults.push({
          tool: fc.functionCall.name,
          input: fc.functionCall.args,
          output: JSON.stringify(toolResult, null, 2),
          summary: getSummary(fc.functionCall.name, fc.functionCall.args, toolResult)
        })
      } catch (err) {
        functionResponses.push({
          functionResponse: { name: fc.functionCall.name, response: { error: err.message } }
        })
        toolResults.push({
          tool: fc.functionCall.name,
          input: fc.functionCall.args,
          output: JSON.stringify({ error: err.message }),
          summary: `Error: ${err.message}`
        })
      }
    }

    result = await chat.sendMessage(functionResponses)
    response = result.response
  }

  let newDir = currentDir
  const listResult = toolResults.find(t => t.tool === 'list_files')
  if (listResult) {
    try {
      const parsed = JSON.parse(listResult.output)
      if (parsed.path) newDir = parsed.path
    } catch (e) {}
  }

  return { content: finalContent, toolResults, currentDir: newDir }
}

// ─── NVIDIA NIM Chat Handler (OpenAI-compatible) ─────────────────────
async function handleNvidiaChat(messages, currentDir, parameter, imageData = null, modelName = null) {
  const nvidiaModel = modelName || 'meta/llama-3.3-70b-instruct'
  
  // Build messages array in OpenAI format
  const systemMsg = { role: 'system', content: getSystemPrompt(parameter) }
  
  const recentMessages = messages.length > 11 ? messages.slice(-11, -1) : messages.slice(0, -1)
  const cleanMessages = recentMessages.filter(m => {
    if (!m.content) return false
    if (m.role === 'assistant' && (
      m.content.includes('functionCall') ||
      m.content.includes('functionResponse') ||
      (m.toolResults && m.toolResults.length > 0)
    )) return false
    return true
  })
  
  const historyMsgs = cleanMessages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }))
  
  const lastMessage = messages[messages.length - 1]
  let userContent = lastMessage.content
  
  // Note: image support is limited on NVIDIA Llama models, send text only
  const allMessages = [systemMsg, ...historyMsgs, { role: 'user', content: userContent }]
  
  let toolResults = []
  let iterations = 0
  const maxIterations = 10
  
  while (iterations < maxIterations) {
    iterations++
    
    const completion = await nvidiaClient.chat.completions.create({
      model: nvidiaModel,
      messages: allMessages,
      tools: TOOLS_FOR_OPENAI,
      tool_choice: 'auto',
      max_tokens: 4096,
    })
    
    const choice = completion.choices[0]
    const assistantMsg = choice.message
    
    // Add assistant message to conversation
    allMessages.push(assistantMsg)
    
    // Check for tool calls
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const tc of assistantMsg.tool_calls) {
        const fnName = tc.function.name
        let fnArgs = {}
        try { fnArgs = JSON.parse(tc.function.arguments) } catch (e) {}
        
        try {
          const toolResult = await executeTool(fnName, fnArgs)
          const resultStr = JSON.stringify(toolResult)
          
          allMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: resultStr
          })
          
          toolResults.push({
            tool: fnName,
            input: fnArgs,
            output: JSON.stringify(toolResult, null, 2),
            summary: getSummary(fnName, fnArgs, toolResult)
          })
        } catch (err) {
          allMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: err.message })
          })
          toolResults.push({
            tool: fnName,
            input: fnArgs,
            output: JSON.stringify({ error: err.message }),
            summary: `Error: ${err.message}`
          })
        }
      }
      continue // Loop again to get final response
    }
    
    // No tool calls — we have our final response
    let newDir = currentDir
    const listResult = toolResults.find(t => t.tool === 'list_files')
    if (listResult) {
      try {
        const parsed = JSON.parse(listResult.output)
        if (parsed.path) newDir = parsed.path
      } catch (e) {}
    }
    
    return {
      content: assistantMsg.content || '',
      toolResults,
      currentDir: newDir
    }
  }
  
  // Max iterations reached
  return { content: 'I reached the maximum number of tool execution steps. Please try again.', toolResults, currentDir }
}

app.post('/api/chat', async (req, res) => {
  const { messages, currentDir, parameter, model, hasImage, imageData } = req.body

  const primaryKey = process.env.GEMINI_API_KEY
  const secondaryKey = process.env.SECONDARY_GEMINI_API_KEY || process.env.GEMINI_API_KEY_2

  let selectedModel = model || 'gemini-2.0-flash'

  // Check if user selected NVIDIA model
  if (selectedModel.startsWith('nvidia:')) {
    if (hasImage) {
      return res.json({ error: 'NVIDIA models do not support image input. Please switch to Gemini 1.5 Flash or 2.0 Flash.' })
    }
    if (!nvidiaClient) {
      return res.json({ error: 'NVIDIA API key not configured. Please add NVIDIA_API_KEY to server/.env' })
    }
    const nvidiaModel = selectedModel.replace('nvidia:', '')
    console.log(`🚀 Using NVIDIA NIM: ${nvidiaModel}`)
    try {
      const result = await handleNvidiaChat(messages, currentDir, parameter || 'Balanced', null, nvidiaModel)
      result.content = `*(🟢 Generated using NVIDIA ${nvidiaModel})*\n\n${result.content}`
      return res.json({ success: true, ...result })
    } catch (err) {
      return res.json({ error: `NVIDIA Error: ${err.message}` })
    }
  }

  if (!primaryKey) {
    return res.json({ error: 'API key not configured. Please add GEMINI_API_KEY to server/.env' })
  }

  const visionModels = ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash-latest', 'gemini-pro-latest']
  
  if (hasImage && !visionModels.includes(selectedModel)) {
    selectedModel = 'gemini-1.5-pro'
  }

  const performChat = async (apiKey, isFallback = false) => {
    try {
      const result = await handleGeminiChat(
        apiKey, 
        messages, 
        currentDir, 
        parameter || 'Balanced',
        selectedModel,
        hasImage ? imageData : null
      )
      
      if (isFallback) {
        result.content = `*(⚡ Generated using Fallback API Key)*\n\n${result.content}`
      }
      
      return { success: true, result }
    } catch (err) {
      console.error(`${isFallback ? 'Fallback ' : 'Primary '}API Error:`, err.message)
      return { success: false, error: err }
    }
  }

  // Attempt with Primary Key
  let chatResult = await performChat(primaryKey)

  // Check for Quota Error
  const isQuotaError = (err) => {
    if (!err) return false
    return err.status === 429 || 
      (err.message && err.message.toLowerCase().includes('quota')) ||
      (err.message && err.message.includes('429'))
  }

  if (!chatResult.success && isQuotaError(chatResult.error)) {
    if (secondaryKey) {
      console.log('🔄 Primary quota exceeded. Attempting fallback to secondary key...')
      chatResult = await performChat(secondaryKey, true)
    }
  }

  // Tertiary fallback: NVIDIA NIM
  if (!chatResult.success && isQuotaError(chatResult.error) && nvidiaClient) {
    console.log('🔄 All Gemini keys exhausted. Attempting NVIDIA NIM fallback...')
    try {
      const nvidiaResult = await handleNvidiaChat(
        messages, currentDir, parameter || 'Balanced',
        hasImage ? imageData : null
      )
      nvidiaResult.content = `*(🟢 Generated using NVIDIA NIM Fallback)*\n\n${nvidiaResult.content}`
      chatResult = { success: true, result: nvidiaResult }
    } catch (err) {
      console.error('NVIDIA Fallback Error:', err.message)
      chatResult = { success: false, error: err }
    }
  }

  if (chatResult.success) {
    res.json(chatResult.result)
  } else {
    const err = chatResult.error
    
    if (isQuotaError(err)) {
      return res.json({ 
        error: nvidiaClient 
          ? 'All API keys (Gemini + NVIDIA) failed. Please try again later.' 
          : 'All Gemini API keys have exceeded their quota and no NVIDIA fallback is configured. Add NVIDIA_API_KEY to server/.env'
      })
    }

    if (err.message && err.message.includes('image') && err.message.includes('not support')) {
      return res.json({ 
        error: 'This model does not support image input. Please use Gemini 1.5 Pro or Flash.' 
      })
    }

    if (err.message && err.message.includes('API key not valid')) {
      return res.json({ 
        error: 'Invalid API key. Please check your GEMINI_API_KEY in server/.env' 
      })
    }

    res.json({ error: `Error: ${err.message || 'Unknown error occurred'}` })
  }
})

// Streaming chat endpoint using Server-Sent Events
app.post('/api/chat/stream', async (req, res) => {
  const { messages, currentDir, parameter, model, hasImage, imageData } = req.body

  const primaryKey = process.env.GEMINI_API_KEY
  const secondaryKey = process.env.SECONDARY_GEMINI_API_KEY || process.env.GEMINI_API_KEY_2

  if (!primaryKey) {
    return res.json({ error: 'API key not configured. Please add GEMINI_API_KEY to server/.env' })
  }

  let selectedModel = model || 'gemini-2.0-flash'
  const visionModels = ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash-latest', 'gemini-pro-latest']
  
  if (hasImage && !visionModels.includes(selectedModel)) {
    selectedModel = 'gemini-2.0-flash'
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const performStreamChat = async (apiKey, isFallback = false) => {
    try {
      const genAI_instance = new GoogleGenerativeAI(apiKey)
      
      const modelConfig = {
        model: selectedModel,
        systemInstruction: getSystemPrompt(parameter || 'Balanced'),
      }

      if (!hasImage) {
        modelConfig.tools = TOOLS_FOR_GEMINI
      }
      
      const genModel = genAI_instance.getGenerativeModel(modelConfig)

      const recentMessages = messages.length > 11 ? messages.slice(-11, -1) : messages.slice(0, -1)
      // Filter out messages with tool results to prevent function call history errors
      const cleanMessages = recentMessages.filter(m => {
        if (!m.content) return false
        if (m.role === 'assistant' && (
          m.content.includes('functionCall') ||
          m.content.includes('functionResponse') ||
          (m.toolResults && m.toolResults.length > 0)
        )) return false
        return true
      })
      // Ensure history alternates user/model
      const geminiHistory = []
      let lastRole = null
      for (const m of cleanMessages) {
        const role = m.role === 'assistant' ? 'model' : 'user'
        if (role === lastRole) {
          geminiHistory[geminiHistory.length - 1].parts[0].text += '\n' + m.content
        } else {
          geminiHistory.push({ role, parts: [{ text: m.content }] })
          lastRole = role
        }
      }
      if (geminiHistory.length > 0 && geminiHistory[0].role !== 'user') {
        geminiHistory.shift()
      }

      const chat = genModel.startChat({ history: geminiHistory })
      
      const lastMessage = messages[messages.length - 1]
      let contentParts = [{ text: lastMessage.content }]
      
      if (hasImage && imageData) {
        const base64Data = imageData.split(',')[1]
        const mimeType = imageData.split(';')[0].replace('data:', '')
        contentParts.push({
          inlineData: { mimeType, data: base64Data }
        })
      }

      if (isFallback) {
        sendSSE('chunk', { text: '*(⚡ Fallback API Key)*\n\n' })
      }

      // Try streaming first
      const streamResult = await chat.sendMessageStream(contentParts)
      
      let fullContent = ''
      let toolCalls = []

      for await (const chunk of streamResult.stream) {
        const candidate = chunk.candidates?.[0]
        if (!candidate) continue

        const parts = candidate.content?.parts || []
        const fcs = parts.filter(p => p.functionCall)
        
        if (fcs.length > 0) {
          // Tool calls detected — switch to non-streaming tool execution
          toolCalls = fcs
          break
        }

        const textParts = parts.filter(p => p.text)
        for (const tp of textParts) {
          sendSSE('chunk', { text: tp.text })
          fullContent += tp.text
        }
      }

      // Handle tool calls if any
      let toolResults = []
      if (toolCalls.length > 0) {
        sendSSE('status', { message: 'Executing tools...' })

        let iterations = 0
        const maxIterations = 10
        let pendingCalls = toolCalls

        while (pendingCalls.length > 0 && iterations < maxIterations) {
          iterations++
          const functionResponses = []
          
          for (const fc of pendingCalls) {
            try {
              const toolResult = await executeTool(fc.functionCall.name, fc.functionCall.args)
              functionResponses.push({
                functionResponse: { name: fc.functionCall.name, response: toolResult }
              })
              toolResults.push({
                tool: fc.functionCall.name,
                input: fc.functionCall.args,
                output: JSON.stringify(toolResult, null, 2),
                summary: getSummary(fc.functionCall.name, fc.functionCall.args, toolResult)
              })
            } catch (err) {
              functionResponses.push({
                functionResponse: { name: fc.functionCall.name, response: { error: err.message } }
              })
              toolResults.push({
                tool: fc.functionCall.name,
                input: fc.functionCall.args,
                output: JSON.stringify({ error: err.message }),
                summary: `Error: ${err.message}`
              })
            }
          }

          // Send tool results back and resume streaming
          const nextStream = await chat.sendMessageStream(functionResponses)
          pendingCalls = []
          
          for await (const chunk of nextStream.stream) {
            const candidate = chunk.candidates?.[0]
            if (!candidate) continue
            const parts = candidate.content?.parts || []
            const fcs = parts.filter(p => p.functionCall)
            
            if (fcs.length > 0) {
              pendingCalls = fcs
              break
            }

            const textParts = parts.filter(p => p.text)
            for (const tp of textParts) {
              sendSSE('chunk', { text: tp.text })
              fullContent += tp.text
            }
          }
        }
      }

      // Determine new directory
      let newDir = currentDir
      const listResult = toolResults.find(t => t.tool === 'list_files')
      if (listResult) {
        try {
          const parsed = JSON.parse(listResult.output)
          if (parsed.path) newDir = parsed.path
        } catch (e) {}
      }

      sendSSE('done', { toolResults, currentDir: newDir })
      return { success: true }
    } catch (err) {
      console.error(`${isFallback ? 'Fallback ' : 'Primary '}Stream API Error:`, err.message)
      return { success: false, error: err }
    }
  }

  const isQuotaError = (err) => {
    if (!err) return false
    return err.status === 429 || 
      (err.message && err.message.toLowerCase().includes('quota')) ||
      (err.message && err.message.includes('429'))
  }

  let result = await performStreamChat(primaryKey)

  if (!result.success && isQuotaError(result.error) && secondaryKey) {
    result = await performStreamChat(secondaryKey, true)
  }

  // Tertiary fallback: NVIDIA NIM (non-streaming, sent as one chunk)
  if (!result.success && isQuotaError(result.error) && nvidiaClient) {
    console.log('🔄 All Gemini keys exhausted. Attempting NVIDIA NIM fallback (stream)...')
    try {
      sendSSE('chunk', { text: '*(🟢 NVIDIA NIM Fallback)*\n\n' })
      
      const nvidiaModel = 'meta/llama-3.3-70b-instruct'
      const systemMsg = { role: 'system', content: getSystemPrompt(parameter || 'Balanced') }
      
      const recentMessages = messages.length > 11 ? messages.slice(-11, -1) : messages.slice(0, -1)
      const cleanMsgs = recentMessages.filter(m => {
        if (!m.content) return false
        if (m.role === 'assistant' && (m.content.includes('functionCall') || m.content.includes('functionResponse') || (m.toolResults && m.toolResults.length > 0))) return false
        return true
      })
      const historyMsgs = cleanMsgs.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      const lastMsg = messages[messages.length - 1]
      const allMsgs = [systemMsg, ...historyMsgs, { role: 'user', content: lastMsg.content }]
      
      let toolResults = []
      let iterations = 0
      const maxIter = 10
      let done = false
      
      while (!done && iterations < maxIter) {
        iterations++
        const completion = await nvidiaClient.chat.completions.create({
          model: nvidiaModel,
          messages: allMsgs,
          tools: TOOLS_FOR_OPENAI,
          tool_choice: 'auto',
          max_tokens: 4096,
        })
        
        const assistantMsg = completion.choices[0].message
        allMsgs.push(assistantMsg)
        
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          sendSSE('status', { message: 'Executing tools via NVIDIA...' })
          for (const tc of assistantMsg.tool_calls) {
            const fnName = tc.function.name
            let fnArgs = {}
            try { fnArgs = JSON.parse(tc.function.arguments) } catch (e) {}
            try {
              const toolResult = await executeTool(fnName, fnArgs)
              allMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) })
              toolResults.push({ tool: fnName, input: fnArgs, output: JSON.stringify(toolResult, null, 2), summary: getSummary(fnName, fnArgs, toolResult) })
            } catch (err) {
              allMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: err.message }) })
              toolResults.push({ tool: fnName, input: fnArgs, output: JSON.stringify({ error: err.message }), summary: `Error: ${err.message}` })
            }
          }
        } else {
          // Final text response
          if (assistantMsg.content) {
            sendSSE('chunk', { text: assistantMsg.content })
          }
          done = true
        }
      }
      
      let newDir = currentDir
      const listRes = toolResults.find(t => t.tool === 'list_files')
      if (listRes) { try { const p = JSON.parse(listRes.output); if (p.path) newDir = p.path } catch (e) {} }
      
      sendSSE('done', { toolResults, currentDir: newDir })
      result = { success: true }
    } catch (err) {
      console.error('NVIDIA Stream Fallback Error:', err.message)
      result = { success: false, error: err }
    }
  }

  if (!result.success) {
    const err = result.error
    let errorMsg = `Error: ${err?.message || 'Unknown error'}`
    if (isQuotaError(err)) errorMsg = nvidiaClient
      ? 'All API keys (Gemini + NVIDIA) failed. Please try again later.'
      : 'All Gemini keys exhausted. Add NVIDIA_API_KEY to server/.env for fallback.'
    if (err?.message?.includes('API key not valid')) errorMsg = 'Invalid API key. Check server/.env'
    sendSSE('error', { error: errorMsg })
  }

  res.end()
})

function getSummary(toolName, input, result) {
  if (result.error) return `Error: ${result.error}`
  
  switch (toolName) {
    case 'list_files': return `${result.count || 0} items in ${path.basename(result.path || input.path)}`
    case 'find_file': return `Found ${result.found || 0} files matching "${input.filename}"`
    case 'open_file': return `Opened ${path.basename(input.path)}`
    case 'open_app': return `Launched ${input.app_name}`
    case 'move_file': return `Moved to ${path.basename(result.to || input.destination)}`
    case 'organize_folder': return `Organized ${result.organized || 0} files into categories`
    case 'create_directory': return `Created folder ${path.basename(result.path || input.path)}`
    case 'delete_file': return `Deleted ${path.basename(result.deleted || input.path)}`
    case 'get_system_info': return `Retrieved system information`
    case 'run_command': return result.success ? 'Command executed successfully' : 'Command failed'
    default: return 'Completed'
  }
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🚀 ARIA Server v2.2.0 (Gemini + NVIDIA Fallback)`)
  console.log(`   Running on: http://localhost:${PORT}`)
  console.log(`   Gemini API Key: ${process.env.GEMINI_API_KEY ? '✓ Configured' : '✗ Not set'}`)
  console.log(`   Secondary Gemini Key: ${process.env.SECONDARY_GEMINI_API_KEY ? '✓ Configured' : '✗ Not set'}`)
  console.log(`   NVIDIA NIM Key: ${nvidiaClient ? '✓ Configured' : '✗ Not set'}`)
  console.log(`   Platform: ${process.platform}\n`)
})
