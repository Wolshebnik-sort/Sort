import * as vscode from 'vscode';
import { PREVIEW_SCHEME, SUPPORTED_LANGUAGE_IDS } from './constants';
import { SortContentProvider } from './sortContentProvider';

const SUPPORTED_LANGUAGES = new Set(SUPPORTED_LANGUAGE_IDS);

class SortContentPreviewProvider implements vscode.TextDocumentContentProvider {
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
  return SUPPORTED_LANGUAGES.has(
    languageId as (typeof SUPPORTED_LANGUAGE_IDS)[number]
  );
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Sort Content extension is now active!');

  const provider = new SortContentProvider();
  const previewProvider = new SortContentPreviewProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, previewProvider)
  );

  // Register sorting commands
  const disposable = vscode.commands.registerCommand(
    'sortImports.sortImports',
    async () => {
      try {
        await runSortContent(provider);
      } catch (error) {
        vscode.window.showErrorMessage(`Error while sorting content: ${error}`);
      }
    }
  );

  context.subscriptions.push(disposable);

  const applyDisposable = vscode.commands.registerCommand(
    'sortImports.applySortImports',
    async () => {
      try {
        await runSortContent(provider);
      } catch (error) {
        vscode.window.showErrorMessage(`Error while applying sorted content: ${error}`);
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
          'Sort preview only works with JavaScript, TypeScript, and style files'
        );
        return;
      }

      try {
        const originalContent = document.getText();
        const sortedContent = provider.getSortedContent(document);

        if (sortedContent === originalContent) {
          vscode.window.showInformationMessage('No sorting changes were needed.');
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
          `Sort Preview: ${fileName}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error while previewing sorted content: ${error}`);
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
      SUPPORTED_LANGUAGE_IDS,
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
    SUPPORTED_LANGUAGE_IDS,
    {
      provideCodeActions(
        document: vscode.TextDocument
      ): vscode.CodeAction[] {
        if (!isSupportedLanguage(document.languageId)) {
          return [];
        }

        const quickFixAction = new vscode.CodeAction(
          'Sort Imports & Styles',
          vscode.CodeActionKind.QuickFix
        );
        quickFixAction.command = {
          command: 'sortImports.sortImports',
          title: 'Sort Imports & Styles',
        };
        quickFixAction.isPreferred = true;

        const sourceAction = new vscode.CodeAction(
          'Sort Imports & Styles',
          vscode.CodeActionKind.Source.append('sortImports')
        );
        sourceAction.command = {
          command: 'sortImports.sortImports',
          title: 'Sort Imports & Styles',
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
  console.log('Sort Content extension is now deactivated!');
}

async function runSortContent(provider: SortContentProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (!isSupportedLanguage(document.languageId)) {
    vscode.window.showErrorMessage(
      'Sorting only works with JavaScript, TypeScript, and style files'
    );
    return;
  }

  const didChange = await provider.sortContent(editor);
  if (didChange) {
    vscode.window.showInformationMessage('Content sorted successfully!');
  } else {
    vscode.window.showInformationMessage('No sorting changes were needed.');
  }
}
