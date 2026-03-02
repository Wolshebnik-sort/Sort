import * as vscode from 'vscode';

import { STYLE_LANGUAGE_IDS } from './constants';
import { getSortConfig } from './sortContent/config';
import { sortContent } from './sortContent/contentSorter';
import { sortStyleContent } from './sortContent/style/sorter';

export class SortContentProvider {
  public async sortContent(editor: vscode.TextEditor): Promise<boolean> {
    const document = editor.document;
    const content = document.getText();
    const sortedContent = this.getSortedContent(document);

    if (sortedContent === content) {
      return false;
    }

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(content.length)
    );

    edit.replace(document.uri, fullRange, sortedContent);
    return vscode.workspace.applyEdit(edit);
  }

  public getFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
    const content = document.getText();
    const sortedContent = this.getSortedContent(document);

    if (sortedContent === content) {
      return [];
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(content.length)
    );

    return [vscode.TextEdit.replace(fullRange, sortedContent)];
  }

  public getSortedContent(document: vscode.TextDocument): string {
    const config = getSortConfig(document.uri);

    if (isStyleLanguage(document.languageId)) {
      return config.enableStyleSorting
        ? sortStyleContent(document.getText(), {
            indent: config.indent,
            groupsOrder: config.styleGroupsOrder,
          })
        : document.getText();
    }

    return sortContent(document.getText(), config);
  }
}

function isStyleLanguage(languageId: string): boolean {
  return STYLE_LANGUAGE_IDS.includes(languageId as (typeof STYLE_LANGUAGE_IDS)[number]);
}
