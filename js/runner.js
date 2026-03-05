async function runCode(workspace) {
  const code = Blockly.JavaScript.workspaceToCode(workspace);
  try {
    await eval(`(async () => { ${code} })()`);
  } catch (e) {
    console.error(e);
    alert("Error: " + e);
  }
}
