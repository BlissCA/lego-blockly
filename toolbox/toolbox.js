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
        { "kind": "block", "type": "loop_forever" },
        { "kind": "block", "type": "yield" },
        { "kind": "block", "type": "lego_button_event" },
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
        },
        {
          "kind": "category",
          "name": "Timers",
          "contents": [
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
        }
      ]
    },
    {"kind": "category", "name": "Lego A", "colour": 30, "contents": [
        {
          "kind": "block",
          "type": "legoa_inp_on",
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
          "type": "legoa_inp_val",
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
          "type": "legoa_out_on",
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
          "type": "legoa_out_off",
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
          "type": "legoa_out_offall",
        },
        {
          "kind": "block",
          "type": "legoa_out_pwm",
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
          "type": "legoa_combo_l",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "Legoa_comboalpha",
                "fields": { "LETTER": "0" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "legoa_combo_r",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "Legoa_comboalpha",
                "fields": { "LETTER": "0" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "legoa_combo_off",
          "inputs": {
            "PORT": {
              "shadow": {
                "type": "Legoa_comboalpha",
                "fields": { "LETTER": "0" }
              }
            }
          }
        },
        {
          "kind": "block",
          "type": "legoa_combo_pwml",
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
            }
          }
        },
        {
          "kind": "block",
          "type": "legoa_combo_pwmr",
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
    {
      "kind": "category",
      "name": "Lego RCX",
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