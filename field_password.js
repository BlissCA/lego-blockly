class FieldPassword extends Blockly.FieldTextInput {
  constructor(value, opt_validator) {
    super(value, opt_validator);

    this.isPasswordVisible = false;
  }

  // Render with an eye icon
  showEditor_() {
    super.showEditor_();

    const input = this.htmlInput_;
    if (!input) return;

    input.type = this.isPasswordVisible ? "text" : "password";

    // Add the eye icon
    const eye = document.createElement("span");
    eye.textContent = this.isPasswordVisible ? "👁️" : "👁️‍🗨️";
    eye.style.cursor = "pointer";
    eye.style.marginLeft = "6px";
    eye.style.userSelect = "none";

    eye.onclick = () => {
      this.isPasswordVisible = !this.isPasswordVisible;
      input.type = this.isPasswordVisible ? "text" : "password";
      eye.textContent = this.isPasswordVisible ? "👁️" : "👁️‍🗨️";
    };

    input.parentNode.appendChild(eye);
  }
}

Blockly.fieldRegistry.register("field_password", FieldPassword);