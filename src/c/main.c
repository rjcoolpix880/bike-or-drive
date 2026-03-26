#include <pebble.h>

static Window *s_main_window;
static Layer *s_canvas_layer;
static char s_bike_decision[8] = "WAIT";
static char s_update_time[32] = "Loading...";
static uint8_t s_precip_data[24];
static bool s_has_data = false;
static bool s_is_connected = true;

// Animation logic
static AppTimer *s_anim_timer;
static int s_anim_progress = 100; // 0 to 100

static float ease_out_back(float t) {
  float c1 = 1.70158f;
  float c3 = c1 + 1.0f;
  return 1.0f + c3 * (t - 1.0f)*(t - 1.0f)*(t - 1.0f) + c1 * (t - 1.0f)*(t - 1.0f);
}

static void anim_timer_callback(void *data) {
  s_anim_progress += 5;
  if (s_anim_progress > 100) s_anim_progress = 100;
  layer_mark_dirty(s_canvas_layer);
  if (s_anim_progress < 100) {
    s_anim_timer = app_timer_register(33, anim_timer_callback, NULL);
  } else {
    s_anim_timer = NULL;
  }
}

static void start_animation() {
  s_anim_progress = 0;
  if (s_anim_timer) {
    app_timer_cancel(s_anim_timer);
  }
  s_anim_timer = app_timer_register(33, anim_timer_callback, NULL);
}

static void canvas_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);

  // Background black
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);

  // If no connection, draw red X
  if (!s_is_connected) {
    graphics_context_set_text_color(ctx, GColorRed);
    graphics_draw_text(ctx, "X", fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD), GRect(0, 0, bounds.size.w, 20), 
                       GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  }

  if (!s_has_data) {
    graphics_context_set_text_color(ctx, GColorWhite);
    graphics_draw_text(ctx, "Loading...", fonts_get_system_font(FONT_KEY_GOTHIC_18), GRect(0, bounds.size.h/2 - 10, bounds.size.w, 30),
                       GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
    return;
  }

  // Draw Decision
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, s_bike_decision, fonts_get_system_font(FONT_KEY_BITHAM_42_LIGHT), 
                     GRect(0, 5, bounds.size.w, 50),
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);

  // Graph Area
  int top_margin = 55;
  int bottom_margin = 42;
  int graph_height = bounds.size.h - bottom_margin - top_margin;
  
  // 50% threshold dotted
  int y50 = top_margin + (graph_height / 2);
  graphics_context_set_fill_color(ctx, GColorWhite);
  for (int dx = 0; dx < bounds.size.w; dx += 4) {
    graphics_fill_rect(ctx, GRect(dx, y50, 2, 1), 0, GCornerNone);
  }

  int bar_width = bounds.size.w / 24;
  float ease_val = ease_out_back(s_anim_progress / 100.0f);

  for (int i=0; i<24; i++) {
    int hour = i + 1; // 1 to 24 (where 24 is midnight)
    int precip = (int)s_precip_data[i];
    
    int bHeight = (precip * graph_height) / 100;
    bHeight = (int)(bHeight * ease_val);
    if (bHeight < 0) bHeight = 0;
    
    int x = i * bar_width;
    int w = bar_width - 1; // 1px gap
    int y = top_margin + graph_height - bHeight;
    
    if (bHeight > 0) {
      if (hour == 9 || hour == 17) {
        graphics_context_set_fill_color(ctx, GColorWhite);
      } else {
        graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorWhite));
      }
      graphics_fill_rect(ctx, GRect(x, y, w, bHeight), 0, GCornerNone);
    }
    
    // x-axis labels at 6a, 12p, 6p, 12a
    if (hour % 6 == 0) {
      int display_h = hour % 12;
      display_h = display_h == 0 ? 12 : display_h;
      char const *ampm = hour < 12 ? "a" : ((hour == 24) ? "a" : "p");
      
      static char label_str[8];
      snprintf(label_str, sizeof(label_str), "%d%s", display_h, ampm);
      
      GSize text_size = graphics_text_layout_get_content_size(label_str, fonts_get_system_font(FONT_KEY_GOTHIC_18), GRect(0,0,100,100), GTextOverflowModeWordWrap, GTextAlignmentLeft);
      int label_width = text_size.w;
      
      int label_x = x + (w / 2) - (label_width / 2);
      if (label_x < 0) label_x = 0;
      if (label_x + label_width > bounds.size.w) label_x = bounds.size.w - label_width;
      
      graphics_context_set_text_color(ctx, GColorWhite);
      graphics_draw_text(ctx, label_str, fonts_get_system_font(FONT_KEY_GOTHIC_18), 
                         GRect(label_x, bounds.size.h - bottom_margin, label_width + 5, 20),
                         GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
    }
  }

  // Current Time Vertical Dotted Line
  time_t temp = time(NULL);
  struct tm *tick_time = localtime(&temp);
  int ch = tick_time->tm_hour; // 0 to 23
  int cm = tick_time->tm_min;
  
  int curCol = ch - 1;
  if (curCol < 0) curCol = 23;
  
  int current_line_x = curCol * bar_width + (cm * bar_width / 60);
  graphics_context_set_fill_color(ctx, GColorWhite);
  for (int dy = top_margin; dy < top_margin + graph_height; dy += 4) {
    graphics_fill_rect(ctx, GRect(current_line_x, dy, 1, 2), 0, GCornerNone);
  }

  // Update Time String
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, s_update_time, fonts_get_system_font(FONT_KEY_GOTHIC_18), 
                     GRect(0, bounds.size.h - 22, bounds.size.w, 20),
                     GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}

static void inbox_received_callback(DictionaryIterator *iterator, void *context) {
  Tuple *decision_tuple = dict_find(iterator, MESSAGE_KEY_DECISION);
  Tuple *precip_tuple = dict_find(iterator, MESSAGE_KEY_PRECIP_DATA);
  Tuple *update_tuple = dict_find(iterator, MESSAGE_KEY_UPDATE_TIME);

  if (decision_tuple) {
    snprintf(s_bike_decision, sizeof(s_bike_decision), "%s", decision_tuple->value->cstring);
  }
  if (update_tuple) {
    snprintf(s_update_time, sizeof(s_update_time), "%s", update_tuple->value->cstring);
  }
  if (precip_tuple) {
    memcpy(s_precip_data, precip_tuple->value->data, precip_tuple->length < 24 ? precip_tuple->length : 24);
    s_has_data = true;
    start_animation();
  }
}

static void inbox_dropped_callback(AppMessageResult reason, void *context) { }
static void outbox_failed_callback(DictionaryIterator *iterator, AppMessageResult reason, void *context) { }
static void outbox_sent_callback(DictionaryIterator *iterator, void *context) { }

static void bluetooth_callback(bool connected) {
  s_is_connected = connected;
  layer_mark_dirty(s_canvas_layer);
  if (!connected) vibes_double_pulse();
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  layer_mark_dirty(s_canvas_layer); // update time line
  if (tick_time->tm_min % 30 == 0) {
    DictionaryIterator *iter;
    app_message_outbox_begin(&iter);
    dict_write_uint8(iter, MESSAGE_KEY_REQUEST_WEATHER, 1);
    app_message_outbox_send();
  }
}

static void main_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_canvas_layer = layer_create(bounds);
  layer_set_update_proc(s_canvas_layer, canvas_update_proc);
  layer_add_child(window_layer, s_canvas_layer);
}

static void main_window_unload(Window *window) {
  layer_destroy(s_canvas_layer);
  if (s_anim_timer) {
    app_timer_cancel(s_anim_timer);
  }
}

static void init() {
  s_main_window = window_create();
  window_set_background_color(s_main_window, GColorBlack);
  window_set_window_handlers(s_main_window, (WindowHandlers) {
    .load = main_window_load,
    .unload = main_window_unload
  });
  window_stack_push(s_main_window, true);

  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
  connection_service_subscribe((ConnectionHandlers) {
    .pebble_app_connection_handler = bluetooth_callback
  });
  bluetooth_callback(connection_service_peek_pebble_app_connection());

  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);
  app_message_register_outbox_sent(outbox_sent_callback);
  app_message_open(256, 128); // larger inbox for byte array data
}

static void deinit() {
  window_destroy(s_main_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
