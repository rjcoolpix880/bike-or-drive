module.exports = [
  {
    "type": "heading",
    "defaultValue": "App Configuration"
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Commute Times"
      },
      {
        "type": "slider",
        "messageKey": "COMMUTE_MORNING",
        "defaultValue": 9,
        "label": "Morning Commute Hour (0=Off, 1-23)",
        "min": 0,
        "max": 23,
        "step": 1
      },
      {
        "type": "slider",
        "messageKey": "COMMUTE_EVENING",
        "defaultValue": 17,
        "label": "Evening Commute Hour (0=Off, 1-23)",
        "min": 0,
        "max": 23,
        "step": 1
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Weather Settings"
      },
      {
        "type": "slider",
        "messageKey": "PRECIP_THRESHOLD",
        "defaultValue": 50,
        "label": "Precipitation Threshold (%)",
        "min": 0,
        "max": 100,
        "step": 5
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save Settings"
  }
];
