import * as vscode from 'vscode';
import { SortImportsProvider } from './sortImportsProvider';

const PREVIEW_SCHEME = 'sort-imports-preview';
const SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact',
]);

class SortImportsPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly previews = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();

  public readonly onDidChange = this.emitter.event;

  public update(uri: vscode.Uri, content: string): void {
    this.previews.set(uri.toString(), content);
    this.emitter.fire(uri);
  }

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.previews.get(uri.toString()) ?? '';
  }
}

function isSupportedLanguage(languageId: string): boolean {
  return SUPPORTED_LANGUAGES.has(languageId);
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Sort Imports extension is now active!');

  const provider = new SortImportsProvider();
  const previewProvider = new SortImportsPreviewProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, previewProvider)
  );

  // Регистрируем команду для сортировки импортов
  const disposable = vscode.commands.registerCommand(
    'sortImports.sortImports',
    async () => {
      try {
        await runSortImports(provider);
      } catch (error) {
        vscode.window.showErrorMessage(`Error sorting imports: ${error}`);
      }
    }
  );

  context.subscriptions.push(disposable);

  const applyDisposable = vscode.commands.registerCommand(
    'sortImports.applySortImports',
    async () => {
      try {
        await runSortImports(provider);
      } catch (error) {
        vscode.window.showErrorMessage(`Error applying sorted imports: ${error}`);
      }
    }
  );

  context.subscriptions.push(applyDisposable);

  const previewDisposable = vscode.commands.registerCommand(
    'sortImports.previewSortImports',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      const document = editor.document;
      if (!isSupportedLanguage(document.languageId)) {
        vscode.window.showErrorMessage(
          'Sort Imports preview only works with JavaScript and TypeScript files'
        );
        return;
      }

      try {
        const originalContent = document.getText();
        const sortedContent = provider.getSortedContent(document);

        if (sortedContent === originalContent) {
          vscode.window.showInformationMessage('No import changes were needed.');
          return;
        }

        const previewUri = vscode.Uri.from({
          scheme: PREVIEW_SCHEME,
          path: document.uri.path,
          query: document.uri.toString(),
        });

        previewProvider.update(previewUri, sortedContent);

        const fileName = document.uri.path.split('/').pop() || 'current file';
        await vscode.commands.executeCommand(
          'vscode.diff',
          document.uri,
          previewUri,
          `Sort Imports Preview: ${fileName}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error previewing sorted imports: ${error}`);
      }
    }
  );

  context.subscriptions.push(previewDisposable);

  const saveSubscription = vscode.workspace.onWillSaveTextDocument((event) => {
    const document = event.document;

    if (!isSupportedLanguage(document.languageId)) {
      return;
    }

    const config = vscode.workspace.getConfiguration('sortImports', document.uri);
    const sortOnSave = config.get<boolean>('sortOnSave', false);
    if (!sortOnSave) {
      return;
    }

    try {
      const edits = provider.getFormattingEdits(document);
      if (edits.length > 0) {
        event.waitUntil(Promise.resolve(edits));
      }
    } catch (error) {
      console.error('Error while sorting imports on save:', error);
    }
  });

  context.subscriptions.push(saveSubscription);

  // Регистрируем провайдер форматирования (опционально)
  const formattingProvider =
    vscode.languages.registerDocumentFormattingEditProvider(
      ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
      {
        provideDocumentFormattingEdits(
          document: vscode.TextDocument
        ): vscode.TextEdit[] {
          try {
            return provider.getFormattingEdits(document);
          } catch (error) {
            console.error('Error in formatting provider:', error);
            return [];
          }
        },
      }
    );

  context.subscriptions.push(formattingProvider);

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
    {
      provideCodeActions(
        document: vscode.TextDocument
      ): vscode.CodeAction[] {
        if (!isSupportedLanguage(document.languageId)) {
          return [];
        }

        const quickFixAction = new vscode.CodeAction(
          'Sort Imports',
          vscode.CodeActionKind.QuickFix
        );
        quickFixAction.command = {
          command: 'sortImports.sortImports',
          title: 'Sort Imports',
        };
        quickFixAction.isPreferred = true;

        const sourceAction = new vscode.CodeAction(
          'Sort Imports',
          vscode.CodeActionKind.Source.append('sortImports')
        );
        sourceAction.command = {
          command: 'sortImports.sortImports',
          title: 'Sort Imports',
        };

        return [quickFixAction, sourceAction];
      },
    },
    {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Source.append('sortImports'),
      ],
    }
  );

  context.subscriptions.push(codeActionProvider);
}

export function deactivate() {
  console.log('Sort Imports extension is now deactivated!');
}

async function runSortImports(provider: SortImportsProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (!isSupportedLanguage(document.languageId)) {
    vscode.window.showErrorMessage(
      'Sort Imports only works with JavaScript and TypeScript files'
    );
    return;
  }

  const didChange = await provider.sortImports(editor);
  if (didChange) {
    vscode.window.showInformationMessage('Imports sorted successfully!');
  } else {
    vscode.window.showInformationMessage('No import changes were needed.');
  }
}
