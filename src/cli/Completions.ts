/**
 * Shell completion script generator.
 *
 * Generates autocomplete scripts for Bash, Zsh, Fish, and PowerShell.
 */

const COMMANDS = ['discover', 'scan', 'analyze', 'diagnose', 'report', 'completions'];
const FLAGS = ['--version', '--help', '--config', '--debug', '--json', '--markdown', '--ci', '--threshold', '--no-cache', '--clear-cache'];

export function generateCompletions(shell: string): string {
  switch (shell) {
    case 'bash':
      return generateBash();
    case 'zsh':
      return generateZsh();
    case 'fish':
      return generateFish();
    case 'powershell':
      return generatePowerShell();
    default:
      return `# Unsupported shell: ${shell}. Supported: bash, zsh, fish, powershell\n`;
  }
}

function generateBash(): string {
  return `# Bash completions for repodoctor
_repodoctor_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "${COMMANDS.join(' ')}" -- "$cur"))
  elif [ "$COMP_CWORD" -eq 2 ] && [ "\${COMP_WORDS[1]}" = "completions" ]; then
    COMPREPLY=($(compgen -W "bash zsh fish powershell" -- "$cur"))
  else
    COMPREPLY=($(compgen -W "${FLAGS.join(' ')}" -- "$cur"))
  fi
}
complete -F _repodoctor_completions repodoctor
`;
}

function generateZsh(): string {
  return `#compdef repodoctor
# Zsh completions for repodoctor
_repodoctor() {
  local -a commands flags
  commands=(${COMMANDS.map((c) => `'${c}'`).join(' ')})
  flags=(${FLAGS.map((f) => `'${f}'`).join(' ')})

  if [ "$CURRENT" -eq 2 ]; then
    _describe 'command' commands
  elif [ "$CURRENT" -eq 3 ] && [ "$words[2]" = "completions" ]; then
    _values 'shell' bash zsh fish powershell
  else
    _describe 'flag' flags
  fi
}
compdef _repodoctor repodoctor
`;
}

function generateFish(): string {
  return `# Fish completions for repodoctor
complete -c repodoctor -n "__fish_use_subcommand" -a "${COMMANDS.join(' ')}" -d "Command"
complete -c repodoctor -n "__fish_seen_subcommand_from completions" -a "bash zsh fish powershell" -d "Shell"
${FLAGS.map((f) => `complete -c repodoctor -l ${f.replace('--', '')} -d "Flag"`).join('\n')}
`;
}

function generatePowerShell(): string {
  return `# PowerShell completions for repodoctor
Register-ArgumentCompleter -Native -CommandName repodoctor -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $commands = @(${COMMANDS.map((c) => `'${c}'`).join(', ')})
    $flags = @(${FLAGS.map((f) => `'${f}'`).join(', ')})
    
    if ($wordToComplete -match '^--') {
        $flags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_) }
    } else {
        $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_) }
    }
}
`;
}
