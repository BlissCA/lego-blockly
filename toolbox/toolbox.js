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
        { "kind": "block", "type": "logic_ternary" },
        { "kind": "block", "type": "logic_is_between" }
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
      "name": "Bitwise",
      "colour": "#999999",
      "contents": [
        { "kind": "block", "type": "bitwise_operation" },
        { "kind": "block", "type": "bitwise_not" },
        { "kind": "block", "type": "bitwise_testbit" },
        { "kind": "block", "type": "bitwise_setbit" },
        { "kind": "block", "type": "bitwise_clearbit" },
        { "kind": "block", "type": "bitwise_togglebit" },
        { "kind": "block", "type": "bitwise_mask" },
        { "kind": "block", "type": "bitwise_rotate" },
        { "kind": "block", "type": "bitwise_extract" }
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
      "name": "Tasks",
      "colour": "290",
      "contents": [
        { "kind": "block", "type": "task_loop_definition" },
        { "kind": "block", "type": "task_definition" },
        { "kind": "block", "type": "task_start" },
        { "kind": "block", "type": "task_stop" },
        { "kind": "block", "type": "task_is_running" },
        { "kind": "block", "type": "task_is_done" },
        { "kind": "block", "type": "task_has_error" },
        { "kind": "block", "type": "task_stop_all"},
        { "kind": "block", "type": "task_sleep" }

      ]
    },

    {
      "kind": "category",
      "name": "Control",
      "colour": "180",
      "contents": [
        {
          "kind": "category",
          "name": "Loop, Wait",
          "contents": [
            { "kind": "block", "type": "loop_forever",
              "inputs": {
                "COND": {
                  "shadow": {
                    "type": "logic_boolean",
                    "fields": { "BOOL": "TRUE" }
                  }
                }
              }
            },
            { "kind": "block", "type": "yield" },
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
              "type": "lego_wait_until",
              "inputs": {
                "COND": {
                  "shadow": {
                    "type": "logic_boolean"
                  }
                }
              }
            }
          ]
        },
        {
          "kind": "category",
          "name": "Interactive Control",
          "contents": [
            { "kind": "block", "type": "lego_button_event" },
            { "kind": "block", "type": "display_value" },
            { "kind": "block", "type": "interactive_value" },
            { "kind": "block", "type": "interactive_slider"},
            { "kind": "block", "type": "format_number"},
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
            }
          ]
        },

        {
          "kind": "category",
          "name": "One Shot",
          "contents": [
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
            },
            {
              "kind": "block",
              "type": "val_changed",
              "inputs": {
                "VALUE": {
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
          "name": "Timers",
          "contents": [
            {
              "kind": "block",
              "type": "after_time_do",
              "inputs": {
                "TIME": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {
                      "NUM": 5
                    }
                  }
                }
              }
            },

            {
              "kind": "block",
              "type": "after_named_time_do",
              "inputs": {
                "TIME": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {
                      "NUM": 5
                    }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "cancel_named_timer"
            },
            {
              "kind": "block",
              "type": "named_timer_done"
            },
            {
              "kind": "block",
              "type": "named_timer_running"
            },
            {
              "kind": "block",
              "type": "named_timer_elapsed"
            },
            {
              "kind": "block",
              "type": "named_timer_remaining"
            }
          ]
        },
        {
          "kind": "category",
          "name": "Counters",
          "contents": [
            { "kind": "block", "type": "counter_dir" },
            {
              "kind": "block",
              "type": "counter_block",
              "inputs": {
                "DIR": {
                  "shadow": {
                    "type": "counter_dir",
                    "fields": { "COUNTDIR": "UP" }
                  }
                },
                "PRESET": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {
                      "NUM": 5
                    }
                  }
                },
                "TRIGGER": {
                  "shadow": {
                    "type": "logic_boolean",
                    "fields": {
                      "BOOL": "FALSE"
                    }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "counter_reset"
            },
            {
              "kind": "block",
              "type": "counter_set",
              "inputs": {
                "VALUE": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {
                      "NUM": 0
                    }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "counter_get"
            }
          ]
        }        
      ]
    },

    {"kind": "category", "name": "Int. A", "colour": 35, "contents": [
        {
          "kind": "category",
          "name": "Input",
          "contents": [
            {
              "kind": "block",
              "type": "legoa2_inp_on",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_inputnum",
                    "fields": { "NUM": "6" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "legoa2_inp_rot",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_inputnum",
                    "fields": { "NUM": "6" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "legoa2_out_resetrot",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_inputnum",
                    "fields": { "NUM": "6" }
                  }
                },
                "COUNT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 0 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "legoa2_inp_count",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_inputnum",
                    "fields": { "NUM": "6" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "legoa2_inp_count_reset",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_inputnum",
                    "fields": { "NUM": "6" }
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
          "name": "Output",
          "contents": [
            {
              "kind": "block",
              "type": "legoa2_out",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_outportnum",
                    "fields": { "NUM": "0" }
                  }
                }
              }
            },        
            {
              "kind": "block",
              "type": "legoa2_out_offall",
            },
            {
              "kind": "block",
              "type": "legoa2_out_pwm",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_outportnum",
                    "fields": { "NUM": "0" }
                  }
                },
                "PWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                }
              }
            },        
            {
              "kind": "block",
              "type": "legoa2_combo_pwm",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legoa_comboalpha",
                    "fields": { "LETTER": "0" }
                  }
                },
                "PWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "DIR": {
                  "shadow": {
                    "type": "Legoa_dir",
                    "fields": { "NUM": "0" }
                  }
                }
              }
            }
          ]
        },
        {
          "kind": "category",
          "name": "PF IR",
          "contents": [
            { "kind": "block", "type": "Legopf_channel" },
            { "kind": "block", "type": "Legopf_output" },
            { "kind": "block", "type": "Legopf_pwm" },
            {
              "kind": "block",
              "type": "legopf_single",
              "inputs": {
                "CHANNEL": {
                  "shadow": {
                    "type": "Legopf_channel",
                    "fields": { "CHANNEL": "0" }
                  }
                },
                "OUTPUT": {
                  "shadow": {
                    "type": "Legopf_output",
                    "fields": { "OUTPUT": "0" }
                  }
                },
                "PWM": {
                  "shadow": {
                    "type": "Legopf_pwm",
                    "fields": { "PWM": "4" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "legopf_combo",
              "inputs": {
                "CHANNEL": {
                  "shadow": {
                    "type": "Legopf_channel",
                    "fields": { "CHANNEL": "0" }
                  }
                },
                "PWM_B": {
                  "shadow": {
                    "type": "Legopf_pwm",
                    "fields": { "PWM": "4" }
                  }
                },
                "PWM_R": {
                  "shadow": {
                    "type": "Legopf_pwm",
                    "fields": { "PWM": "4" }
                  }
                }
              }
            }
          ]
        }        
      ]
    },

    {
      "kind": "category",
      "name": "Int. B",
      "colour": "20",
      "contents": [
        {
          "kind": "category",
          "name": "Input",
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
            },
            {
              "kind": "block",
              "type": "lego_inp_count",
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
              "type": "lego_inp_count_reset",
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
          "name": "Output Single Port",
          "contents": [
            { "kind": "block", "type": "Legob_outportalpha" },
            {
              "kind": "block",
              "type": "lego_out",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
          "name": "Output Multi Ports",
          "contents": [
            {
              "kind": "block",
              "type": "lego_multi_out"
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
        },
        {
          "kind": "category",
          "name": "Obsolete",
          "contents": [
            {
              "kind": "block",
              "type": "lego_out_on",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Legob_outportalpha",
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
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
                    "fields": { "LETTER": "1" }
                  }
                }
              }
            },
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
            }

          ]
        }
      ]
    },
    {
      "kind": "category",
      "name": "RCX/CM",
      "colour": 20,
      "contents": [
        { "kind": "category", "name": "Motors", "colour": 20, "contents": [
            { "kind": "block", "type": "Rcx_MotPort" },
            {
              "kind": "block",
              "type": "rcx_mot_on",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Rcx_MotPort",
                    "fields": { "LETTER": "1" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "rcx_mot_off",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Rcx_MotPort",
                    "fields": { "LETTER": "1" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "rcx_mot_float",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Rcx_MotPort",
                    "fields": { "LETTER": "1" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "rcx_mot_flip",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Rcx_MotPort",
                    "fields": { "LETTER": "1" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "rcx_mot_f",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Rcx_MotPort",
                    "fields": { "LETTER": "1" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "rcx_mot_r",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Rcx_MotPort",
                    "fields": { "LETTER": "1" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "rcx_mot_pow",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Rcx_MotPort",
                    "fields": { "LETTER": "1" }
                  }
                },
                "PWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 7 }
                  }
                }
              }
            }
          ]
        },
        { "kind": "category", "name": "Sensors Config", "colour": 20, "contents": [
            {
              "kind": "block",
              "type": "rcx_sensortype",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Rcx_InpPort",
                    "fields": { "INPPORT": "0" }
                  }
                }            
              } 
            },
            {
              "kind": "block",
              "type": "rcx_sensormode",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Rcx_InpPort",
                    "fields": { "INPPORT": "0" }
                  }
                }            
              } 
            },            {
              "kind": "block",
              "type": "rcx_sensorclear",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Rcx_InpPort",
                    "fields": { "INPPORT": "0" }
                  }
                }            
              } 
            }                       

          ]
        },
        { "kind": "category", "name": "Misc", "colour": 20, "contents": [
            {
              "kind": "block",
              "type": "rcx_snd",
              "inputs": {
                "SOUND": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {
                      "NUM": 1
                    }
                  }
                }
              }              
            },
            {
              "kind": "block",
              "type": "rcx_msg",
              "inputs": {
                "MSG": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {"NUM": 0,},
                    "min": 0,
                    "max": 255,
                    "precision": 1
                  }
                }
              }              
            },
            {
              "kind": "block",
              "type": "rcx_prog",
              "inputs": {
                "PROG": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {"NUM": 1},
                    "min": 1,
                    "max": 5,
                    "precision": 1
                  }
                }
              }              
            },
            {
              "kind": "block",
              "type": "rcx_starttask",
              "inputs": {
                "TASK": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {"NUM": 0},
                    "min": 0,
                    "max": 9,
                    "precision": 1
                  }
                }
              }              
            },
            {
              "kind": "block",
              "type": "rcx_stoptask",
              "inputs": {
                "TASK": {
                  "shadow": {
                    "type": "math_number",
                    "fields": {"NUM": 0},
                    "min": 0,
                    "max": 9,
                    "precision": 1
                  }
                }
              }              
            },
            {
              "kind": "block",
              "type": "rcx_stopall"
            },
            {
              "kind": "block",
              "type": "rcx_pwroff"
            },
            {
              "kind": "block",
              "type": "rcx_alive"
            },
            {
              "kind": "block",
              "type": "rcx_getval"
            },
            {
              "kind": "block",
              "type": "rcx_getinpval",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "Rcx_InpPort",
                    "fields": { "INPPORT": "0" }
                  }
                }            
              }
            }                                    
          ]
        }
      ]
    },
    {
      "kind": "category",
      "name": "NXT",
      "colour": "#0040d6",
      "contents": [
        { "kind": "category", "name": "Motors", "colour": "#0040d6", "contents": [
            { "kind": "block", "type": "Nxt_MotPort" },
            {
              "kind": "block",
              "type": "nxt_mot_pow",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Nxt_MotPort",
                    "fields": { "LETTER": "0" }
                  }
                },
                "PWR": {
                  "shadow": {
                    "type": "math_number_constrained",
                    "extraState": {
                      "min": -100,
                      "max": 100,
                      "precision": 1
                    },
                    "fields": { "NUM": 80 }
                  }
                }
                
              }
            }					
          ]
        },
        { "kind": "category", "name": "Sensors", "colour": "#0040d6", "contents": [
            { "kind": "block", "type": "Nxt_InpPort" },
            { "kind": "block", "type": "Nxt_SensorType" },
            { "kind": "block", "type": "Nxt_SensorMode" },
            {
              "kind": "block",
              "type": "nxt_set_input_mode",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Nxt_InpPort",
                    "fields": { "INPPORT": "0" }
                  }
                },
                "INPUTTYPE": {
                  "shadow": {
                    "type": "Nxt_SensorType",
                    "fields": { "SENSORTYPE": "1" }
                  }
                },
                "INPUTMODE": {
                  "shadow": {
                    "type": "Nxt_SensorMode",
                    "fields": { "SENSORMODE": "0" }
                  }
                }
                
              }
            },
            {
              "kind": "block",
              "type": "nxt_get_input_values",
              "inputs": {
                "PORTS": {
                  "shadow": {
                    "type": "Nxt_InpPort",
                    "fields": { "INPPORT": "0" }
                  }
                }
                
              }
            }					            

          ]
        },
        { "kind": "category", "name": "Misc", "colour": "#0040d6", "contents": [
            {
              "kind": "block",
              "type": "nxt_playtone",
              "inputs": {
                "FREQ": {
                  "shadow": {
                    "type": "math_number_constrained",
                    "extraState": {
                      "min": 200,
                      "max": 14000,
                      "precision": 1
                    },
                    "fields": {
                      "NUM": 200
                    }
                  }
                },
                "DURATION": {
                  "shadow": {
                    "type": "math_number_constrained",
                    "extraState": {
                      "min": 0,
                      "max": 100000000,
                      "precision": 1
                    },
                    "fields": {"NUM": 1000}
                  }
                }
              }              
            },
            {
              "kind": "block",
              "type": "nxt_playsoundfile",
              "inputs": {
                "FILENAME": {
                  "shadow": {
                    "type": "Nxt_SoundFiles",
                    "fields": { "SOUNDFILE": "! Startup.rso" }
                  }
                }
              }            
            },
            {"kind": "block", "type": "nxt_stopplaysound"}
          ]
        }
      ]
    },
    {"kind": "category", "name": "WeDo 1.0", "colour": 40, "contents": [
        { "kind": "block", "type": "wedo1_tiltval" },
        {
          "kind": "block",
          "type": "wedo1_tilt",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "wedo1_portinp",
                "fields": { "LETTER": "1" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "wedo1_tiltraw",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "wedo1_portinp",
                "fields": { "LETTER": "1" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "wedo1_distance",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "wedo1_portinp",
                "fields": { "LETTER": "1" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "wedo1_distanceraw",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "wedo1_portinp",
                "fields": { "LETTER": "1" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "wedo1_motor",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "wedo1_motport",
                "fields": { "LETTER": "1" }
              }
            },
            "SPEED": {
              "shadow": {
                "type": "math_number",
                "fields": { "NUM": 100 }
              }
            }

          }
        },
        {
          "kind": "block",
          "type": "wedo1_motorstop",
        }
      ]
    },
    {"kind": "category", "name": "WeDo 2.0", "colour": 90, "contents": [
        {
          "kind": "category",
          "name": "Input",
          "contents": [
            {
              "kind": "block",
              "type": "wedo2_get_distance",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "wedo2_ports",
                    "fields": { "WEDO2PORTS": "1" }
                  }
                }
              }
            },            
            {
              "kind": "block",
              "type": "wedo2_get_tilt",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "wedo2_ports",
                    "fields": { "WEDO2PORTS": "1" }
                  }
                }
              }
            },             
            {
              "kind": "block",
              "type": "wedo2_isButtonPressed",
              "inputs": {}
            }            
          ]
        },
        {
          "kind": "category",
          "name": "Output",
          "contents": [
            {
              "kind": "block",
              "type": "wedo2_mot_power",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "wedo2_ports",
                    "fields": { "WEDO2PORTS": "1" }
                  }
                },
                "PWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "wedo2_mot_stop",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "wedo2_ports",
                    "fields": { "WEDO2PORTS": "1" }
                  }
                },
                "BRAKE": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 0 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "wedo2_mot_time",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "wedo2_ports",
                    "fields": { "WEDO2PORTS": "1" }
                  }
                },
                "TIME": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1000 }
                  }
                },
                "POWER": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                },
                "BRAKE": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 0 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "wedo2_led",
              "inputs": {
                "COLOR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 10 }
                  }
                }
              }
            }
          ]
        }
      ]
    },

    {"kind": "category", "name": "VLL Serial", "colour": 50, "contents": [
        {
          "kind": "block",
          "type": "vll_senddata",
          "inputs": {
            "DATA": {
              "shadow": {
                "type": "math_number",
                "fields": { "NUM": 6 }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "vll_preamblems",
          "inputs": {
            "MS": {
              "shadow": {
                "type": "math_number",
                "fields": { "NUM": 1000 }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "vll_unitms",
          "inputs": {
            "MS": {
              "shadow": {
                "type": "math_number",
                "fields": { "NUM": 20 }
              }
            }
          }
        }        
      ]
    },

    {"kind": "category", "name": "LPF2", "colour": 80, "contents": [
        {
          "kind": "category",
          "name": "Input",
          "contents": [
            {
              "kind": "block",
              "type": "lpf2_get_rot",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                }
              }
            },            
            {
              "kind": "block",
              "type": "lpf2_get_distance",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                }
              }
            },            
            {
              "kind": "block",
              "type": "lpf2_get_color",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                }
              }
            },            
            {
              "kind": "block",
              "type": "lpf2_get_tilt",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "AXIS": {
                    "shadow": {
                      "type": "lpf2_axis",
                      "fields": { "LPF2AXIS": "0" }
                    }
                  }

              }
            }             
          ]
        },
        {
          "kind": "category",
          "name": "Output",
          "contents": [
            {
              "kind": "block",
              "type": "lpf2_mot_power",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "PWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lpf2_mot_stop",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "BRAKE": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 0 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lpf2_mot_speed",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "SPEED": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                },
                "MAXPWR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 100 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lpf2_reset_rot",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "COUNT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 0 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lpf2_mot_angle",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "ANGLE": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 360 }
                  }
                },
                "SPEED": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                },
                "ENDSTATE": {
                  "shadow": {
                    "type": "lpf2_endstate",
                    "fields": { "LPF2ENDSTATE": "127" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lpf2_mot_goto",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "POS": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 100 }
                  }
                },
                "SPEED": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                },
                "ENDSTATE": {
                  "shadow": {
                    "type": "lpf2_endstate",
                    "fields": { "LPF2ENDSTATE": "127" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "lpf2_mot_time",
              "inputs": {
                "PORT": {
                  "shadow": {
                    "type": "lpf2_ports",
                    "fields": { "LPF2PORTS": "A" }
                  }
                },
                "TIME": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 1000 }
                  }
                },
                "SPEED": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 50 }
                  }
                },
                "ENDSTATE": {
                  "shadow": {
                    "type": "lpf2_endstate",
                    "fields": { "LPF2ENDSTATE": "127" }
                  }
                }
              }
            }
          ]
        }
      ]
    },

    {"kind": "category", "name": "ToyPad", "colour": 140, "contents": [
        {
          "kind": "category",
          "name": "Tags",
          "contents": [
            {
              "kind": "block",
              "type": "tpad_get_taghex",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_region",
                    "fields": { "TPADREGION": "1" }
                  }
                }
              }
            }             
          ]
        },
        {
          "kind": "category",
          "name": "Leds",
          "contents": [
            {
              "kind": "block",
              "type": "tpad_set_led",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                },
                "ColorR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "ColorG": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "ColorB": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_set_led_cp",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_set_led_sliders",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_set_leds_sliders",
              "inputs": {}
            },            
            {
              "kind": "block",
              "type": "tpad_led_off",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_flash_led",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                },
                "ColorR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "ColorG": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "ColorB": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "T1": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 10 }
                  }
                },
                "T2": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 10 }
                  }
                },
                "CNT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_flash_led_sliders",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                },
                "T1": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 10 }
                  }
                },
                "T2": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 10 }
                  }
                },
                "CNT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_flash_leds_sliders",
              "inputs": {
                "T1_C": {"shadow": {"type": "math_number", "fields": { "NUM": 10 }}},
                "T2_C": {"shadow": {"type": "math_number", "fields": { "NUM": 10 }}},
                "CNT_C": {"shadow": {"type": "math_number", "fields": { "NUM": 255 }}},
                "T1_L": {"shadow": {"type": "math_number", "fields": { "NUM": 10 }}},
                "T2_L": {"shadow": {"type": "math_number", "fields": { "NUM": 10 }}},
                "CNT_L": {"shadow": {"type": "math_number", "fields": { "NUM": 255 }}},
                "T1_R": {"shadow": {"type": "math_number", "fields": { "NUM": 10 }}},
                "T2_R": {"shadow": {"type": "math_number", "fields": { "NUM": 10 }}},
                "CNT_R": {"shadow": {"type": "math_number", "fields": { "NUM": 255 }}}
              }
            },
            {
              "kind": "block",
              "type": "tpad_fade_led",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                },
                "ColorR": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "ColorG": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "ColorB": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 255 }
                  }
                },
                "T1": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 20 }
                  }
                },
                "CNT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 2 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_fade_led_sliders",
              "inputs": {
                "REGION": {
                  "shadow": {
                    "type": "tpad_regionled",
                    "fields": { "TPADREGIONLED": "0" }
                  }
                },
                "T1": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 20 }
                  }
                },
                "CNT": {
                  "shadow": {
                    "type": "math_number",
                    "fields": { "NUM": 2 }
                  }
                }
              }
            },
            {
              "kind": "block",
              "type": "tpad_fade_leds_sliders",
              "inputs": {
                "T1_C": {"shadow": {"type": "math_number", "fields": { "NUM": 20 }}},
                "CNT_C": {"shadow": {"type": "math_number", "fields": { "NUM": 2 }}},
                "T1_L": {"shadow": {"type": "math_number", "fields": { "NUM": 20 }}},
                "CNT_L": {"shadow": {"type": "math_number", "fields": { "NUM": 2 }}},
                "T1_R": {"shadow": {"type": "math_number", "fields": { "NUM": 20 }}},
                "CNT_R": {"shadow": {"type": "math_number", "fields": { "NUM": 2 }}}
              }
            }                 
          ]
        }
      ]
    }

    /*
    {
      "kind": "category",
      "name": "MQTT",
      "colour": 230,
      "contents": [
        {
          "kind": "block",
          "type": "mqtt_config"
        },
        {
          "kind": "block",
          "type": "mqtt_publish"
        },
        {
          "kind": "block",
          "type": "mqtt_subscribe"
        },
        {
          "kind": "block",
          "type": "mqtt_on_message"
        }

      ]
    } */
   
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