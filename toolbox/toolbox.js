const toolbox = {
  "kind": "categoryToolbox",
  "contents": [
    {
      "kind": "category",
      "name": "Logic",
      "categorystyle": "logic_category",
      "contents": [
        { "kind": "block", "type": "controls_if" },
        { "kind": "block", "type": "logic_compare" },
        { "kind": "block", "type": "logic_operation" },
            {
              "kind": "block",
              "type": "logic_negate",
              "inputs": {
                "BOOL": {
                  "shadow": {
                    "type": "logic_boolean",
                    "fields": { "BOOL": "TRUE" }
                  }
                }
              }
            },
        { "kind": "block", "type": "logic_boolean" },
        { "kind": "block", "type": "logic_null" },
        { "kind": "block", "type": "logic_ternary" }
      ]
    },
    {
      "kind": "category",
      "name": "Loops",
      "categorystyle": "loop_category",
      "contents": [
        { "kind": "block", "type": "controls_repeat_ext" },
        { "kind": "block", "type": "controls_whileUntil" },
        { "kind": "block", "type": "controls_for" },
        { "kind": "block", "type": "controls_forEach" },
        { "kind": "block", "type": "controls_flow_statements" }
      ]
    },
    {
      "kind": "category",
      "name": "Math",
      "categorystyle": "math_category",
      "contents": [
        { "kind": "block", "type": "math_number" },
        { "kind": "block", "type": "math_arithmetic" },
        { "kind": "block", "type": "math_single" },
        { "kind": "block", "type": "math_trig" },
        { "kind": "block", "type": "math_number_property" },
        { "kind": "block", "type": "math_round" },
        { "kind": "block", "type": "math_on_list" },
        { "kind": "block", "type": "math_modulo" },
        { "kind": "block", "type": "math_constrain" },
        { "kind": "block", "type": "math_random_int" },
        { "kind": "block", "type": "math_random_float" }
      ]
    },
    {
      "kind": "category",
      "name": "Text",
      "categorystyle": "text_category",
      "contents": [
        { "kind": "block", "type": "text" },
        { "kind": "block", "type": "text_join" },
        { "kind": "block", "type": "text_append" },
        { "kind": "block", "type": "text_length" },
        { "kind": "block", "type": "text_isEmpty" },
        { "kind": "block", "type": "text_indexOf" },
        { "kind": "block", "type": "text_charAt" },
        { "kind": "block", "type": "text_getSubstring" },
        { "kind": "block", "type": "text_changeCase" },
        { "kind": "block", "type": "text_trim" },
        // { "kind": "block", "type": "text_print" },  // the standard Print block use an Alert Winddow which conflict with serial communication
        { "kind": "block", "type": "text_prompt_ext" }
      ]
    },
    {
      "kind": "category",
      "name": "Lists",
      "categorystyle": "list_category",
      "contents": [
        { "kind": "block", "type": "lists_create_empty" },
        { "kind": "block", "type": "lists_create_with" },
        { "kind": "block", "type": "lists_repeat" },
        { "kind": "block", "type": "lists_length" },
        { "kind": "block", "type": "lists_isEmpty" },
        { "kind": "block", "type": "lists_indexOf" },
        { "kind": "block", "type": "lists_getIndex" },
        { "kind": "block", "type": "lists_setIndex" },
        { "kind": "block", "type": "lists_getSublist" },
        { "kind": "block", "type": "lists_split" },
        { "kind": "block", "type": "lists_sort" }
      ]
    },
    {
      "kind": "category",
      "name": "Variables",
      "custom": "VARIABLE",
      "colour": 330
    },
    {
      "kind": "category",
      "name": "Functions",
      "custom": "PROCEDURE",
      "colour": 290
    },
    {
      "kind": "category",
      "name": "Timers",
      "colour": "230",
      "contents": [
        { "kind": "block", "type": "timer_after" },
        { "kind": "block", "type": "timer_reset" },
        { "kind": "block", "type": "timer_stop" },
        { "kind": "block", "type": "timer_value" },
        { "kind": "block", "type": "timer_done" },
        { "kind": "block", "type": "timer_set_value" }
      ]
    },    
    {
      "kind": "category",
      "name": "Control+Wait",
      "colour": "60",
      "contents": [
        {
          "kind": "block",
          "type": "lego_wait_until",
          "inputs": {
            "COND": {
              "shadow": {
                "type": "logic_boolean"
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "lego_wait_time",
          "inputs": {
            "SECS": {
              "shadow": {
                "type": "math_number",
                "fields": { "NUM": 1.00 }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "lego_print_value",
          "inputs": {
            "VALUE": {
              "shadow": {
                "type": "text",
                "fields": { "TEXT": "Hello" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "ons_rising",
          "inputs": {
            "BOOL": {
              "shadow": {
                "type": "logic_boolean",
                "fields": { "BOOL": "TRUE" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "ons_falling",
          "inputs": {
            "BOOL": {
              "shadow": {
                "type": "logic_boolean",
                "fields": { "BOOL": "TRUE" }
              }
            }
          }
        }
      ]
    },
    {
      "kind": "category",
      "name": "Lego B",
      "colour": "20",
      "contents": [
        {
          "kind": "category",
          "name": "Inputs",
          "contents": [
            {
              "kind": "block",
              "type": "lego_inp_on",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_inp_val",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_inp_tempf",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_inp_tempc",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_inp_rot",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_resetrot",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1 }
                  }
                },
                "COUNT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 0 }
                  }
                }
              }
            }            

          ]
        },
        {
          "kind": "category",
          "name": "Outputs Single Port",
          "contents": [
            { "kind": "block", "type": "Legob_outportalpha" },
            {
              "kind": "block",
              "type": "lego_out_on",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_onl",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_onr",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_off",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_float",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_rev",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_l",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lego_out_r",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                }
              }
            },

            {
              "kind": "block",
              "type": "lego_out_pow",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                },
                "PWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 7 }
                  }
                }
              }
            },

            {
              "kind": "block",
              "type": "lego_out_onfor",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "A" }
                  }
                },
                "TIME": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                }
              }
            }

          ]
        },
        {
          "kind": "category",
          "name": "Outputs Multi Ports",
          "contents": [
            {
              "kind": "block",
              "type": "lego_multi_out_on"
            },
            {
              "kind": "block",
              "type": "lego_multi_out_off"
            },
            {
              "kind": "block",
              "type": "lego_multi_out_float"
            },
            {
              "kind": "block",
              "type": "lego_multi_out_Rev"
            },
            {
              "kind": "block",
              "type": "lego_multi_out_L"
            },
            {
              "kind": "block",
              "type": "lego_multi_out_R"
            },

            {
              "kind": "block",
              "type": "lego_multi_pow",
              "inputs": {
                "PWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {
                      "NUM": 7
                    }
                  }
                }
              }              
            },
            {
              "kind": "block",
              "type": "lego_out_offall",
            }
          ]
        }

      ]
    },
/*     {
      "kind": "category",
      "name": "HMI",
      "colour": 45,
      "contents": [
        { "kind": "block", "type": "hmi_button_ui" },
        { "kind": "block", "type": "hmi_button_state" },
        { "kind": "block", "type": "hmi_indicator" },
        { "kind": "block", "type": "hmi_slider" },
        { "kind": "block", "type": "hmi_display" }
      ]
    } */
  ]
};

export default toolbox;