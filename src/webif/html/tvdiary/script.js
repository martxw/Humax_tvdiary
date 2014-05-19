/*
 * TV Diary main display page scripts.
 * Author: Martin Wink, 2013-2014.
 */

// The main page itself is rendered after accessing the DB to initialize the following global variables:
//  day_start seconds offset to the start of the TV day. Relative to local time.
//  min_time time of the earliest available information. In UTC.
//  max_time time of the latest available information. In UTC.
//  monthly_summary_enabled is a 1/0 functionality flag.
//  inventory_enabled is a 1/0 functionality flag.
//  snapshot_time defined only for a published snapshot.
//

// Declare globals

// Today's calendar date start.
var today_start;

// Whether live broadcasts are to be displayed. Toggled on and off.
var including_live = true;

// Start time for the displayed details, with the day_start offset included. Changed by the datepicker. In UTC.
var daily_start_time;

// Year and month selectors for the monthly summary.
var monthly_year;
var monthly_month;
var monthly_initialized = false;

// While awaiting Ajax responses.
var isBusyR = false;
var isBusyW = false;
var isBusyM = false;
var isBusyH = false;

// Monthly summary table sorting order.
var programs_sorting = [[1,0],[2,0]];
var channels_sorting = [[1,0]];

// History results table.
var history_sorting = [[4, 1]];

// Inventory modification time for optimization.
var inventory_modified = 0;

//////
// Logging wrapper.
//////
function log_stuff(x) {
  /* console.log(x); */
  /*$.get("/tvdiary/jslog.jim?msg=" + encodeURIComponent(x));*/
}

//////
// Page loaded - start work.
//////
$(document).ready(function() {
  loadCookies();

  if (typeof shapshot_time == "undefined") {
    today_start = get_tv_day_start(new Date().getTime() / 1000, false);
  } else {
    today_start = get_tv_day_start(shapshot_time, false);
  }

  // Initialize the to-top scroller.
  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  // Initialize the tabs.
  $( "#tvd_tabs" ).tabs({
    heightStyle: "auto",
    activate: function( event, ui ) {
      switch (ui.oldTab.index()) {
        case 0:
          $("#daily_panel").hide();
          break;

        case 1:
          $("#monthly_panel").hide();
          break;

        case 2:
          $("#history_panel").hide();
          break;

        case 3:
          $("#inventory_panel").hide();
          $('#inventory_spinner').show();
          break;

        default:
          break;
      }
      switch (ui.newTab.index()) {
        case 0:
          $("#daily_panel").show("fade");
          break;

        case 1:
          $("#monthly_panel").show("fade");
          if (!monthly_initialized) {
            monthly_initialized = true;
            $('#monthly_month_selector').val( monthly_year * 100 + monthly_month );
            update_monthly(monthly_year, monthly_month);
          }
          break;

        case 2:
          $("#history_panel").show("fade");
          break;

        case 3:
          $("#inventory_panel").show("fade");
          update_inventory();
          break;

        default:
          break;
      }
    }
  });
  $("#daily_panel").show();
  $("#monthly_panel").hide();
  $("#history_panel").hide();
  $("#inventory_panel").hide();

  if (!monthly_summary_enabled) {
    $( "li:has([href='#monthly_tab'])" ).hide();
  }
  if (!inventory_enabled) {
    $( "li:has([href='#inventory_tab'])" ).hide();
  }

  //////
  // Initialize the daily panel.
  //////

  // Initialize the daily datepicker.
  $('#daily_datepicker').datepicker({
    firstDay: 1,
    dateFormat: '@',  //@=ms since 01/01/1970.
    minDate: new Date(min_time * 1000),
    maxDate: new Date(max_time * 1000),
    defaultDate: new Date(today_start * 1000),
    onSelect: function(val, inst) {
      if (isBusyR || isBusyW) {
        log_stuff("UI is busy - not changing the date to " + new Date(Number(val)) + " - restoring " + new Date(daily_start_time*1000) +".");
        $('#daily_datepicker').datepicker("setDate", new Date(daily_start_time * 1000));
      } else {
        // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
        log_stuff("datepicker.onSelect(" + new Date(Number(val)) + ")");
        var chosen = get_tv_day_start(Number(val) / 1000, true);
        update_daily(chosen);
      }
    }
  });
  log_stuff("Initialized the default datepicker time to " + new Date(today_start * 1000));

  $('#daily_prev_day').button()
    .click(function() {
      updateDate(-1);
    });
  $('#daily_today').button()
    .click(function() {
      updateDate(0);
    });
  $('#daily_next_day').button()
    .click(function() {
      updateDate(+1);
    });

  //////
  // Initialize the monthly summary panel.
  //////

  // Initialize the months selector
  {
    var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];
    var minDate =  new Date(min_time * 1000);
    var maxDate = new Date(today_start * 1000);
    var y = minDate.getFullYear();
    var m = minDate.getMonth();
    var maxY = maxDate.getFullYear();
    var maxM = maxDate.getMonth();
    var optionsHtml = "";
    while (y <= maxY) {
      while (m < 12) {
        var val = y * 100 + m + 1;
        optionsHtml += "<option value=\"" + val + "\">" + monthNames[m] + " " + y + "</option>";
        m += 1;
        if (y == maxY && m > maxM) {
          break;
        }
      }
      y += 1;
      m = 0;
    }
    $('#monthly_month_selector').html(optionsHtml);
    monthly_year = maxY;
    monthly_month = maxM + 1;
    $('#monthly_month_selector').on('change', function() {
      var y = (($(this).val() / 100) | 0);
      var m = (($(this).val() % 100) | 0);
      log_stuff("Selected month " + y + " " + m + ".");
      if (isBusyM) {
        log_stuff("UI is busy - not changing the date. Disabling the field must have failed.");
      } else {
        update_monthly(y, m);
      }
    });
  }

  //
  // For durations, sort on the raw number of minutes set in the "sval" attribute.
  //
  var sortValueTextExtraction = function(node) 
  {
    var sval = node.getAttribute("sval");
    if (sval != null) {
      return sval;
    } else {
      return node.innerText;
    }
  }

  $("#monthly_programs_table").tablesorter({
    textExtraction: sortValueTextExtraction,
    headers: {
      0: {
        sorter: false 
      }
    },
    sortInitialOrder: "desc"
  }).bind("sortEnd",function() {
      programs_sorting = this.config.sortList;
      saveCookies();
  });
  $("#monthly_channels_table").tablesorter({
    textExtraction: sortValueTextExtraction,
    headers: {
      0: {
        sorter: false 
      }
    },
    sortInitialOrder: "desc"
  }).bind("sortEnd",function() { 
      channels_sorting = this.config.sortList;
      saveCookies();
  });

  $('#monthly_prev').button()
    .click(function() {
      updateMonth(-1);
    });
  $('#monthly_latest').button()
    .click(function() {
      updateMonth(0);
    });
  $('#monthly_next').button()
    .click(function() {
      updateMonth(+1);
    });

  ///////////////
  // Initialize the history panel.
  ///////////////
  $('#history_results_spinner').hide();
  $('#history_results_footer').html("<span class=\"nothing\">Not searched yet</span>");

    var optionsHtml = "";
    optionsHtml += "<option value=\"E\" selected>equals</option>";
    optionsHtml += "<option value=\"C\">contains</option>";
    optionsHtml += "<option value=\"S\">begins</option>";
    optionsHtml += "<option value=\"F\">ends</option>";
    optionsHtml += "<option value=\"M\">matches</option>";
    
    $('#history_search_op_title').html(optionsHtml);
    $('#history_search_op_synopsis').html(optionsHtml);
    $('#history_search_op_channel').html(optionsHtml);

  $("#history_results_table").tablesorter({
    textExtraction: sortValueTextExtraction,
    headers: {
      0: {
        sorter: false 
      }
    },
    sortInitialOrder: "desc"
  }).bind("sortEnd",function() {
      history_sorting = this.config.sortList;
      saveCookies();
  });

  $('#history_search_button').button().click(function() {
    searchHistory();
  });


  ///////////////
  ///////////////

  //////
  // Round the given time to the start of the TV day. The input andoutput times are UTC epoch values.
  // Since the start of TV day is in the local time, convert from UTC first, and restore to UTC after rounding.
  // If the input time's granularity includes the current time of day, then we need to *subtract* the day_start
  // before rounding down to the start of the day, so that between midnight and the start of the TV day we round
  // to the previous day. E.g. at 1am Tuesday we display Monday's TV schedule.
  // The granularity is date only for values from the datepicker because it returns midnight local time in UTC.
  //////
  function get_tv_day_start(t, date_only) {
    var d = new Date(Math.floor(t) * 1000);
    return Math.floor((((d.getTime() - d.getTimezoneOffset() * 60000) / 1000.0) - (date_only ? 0 : day_start)) / 86400) * 86400 + (day_start + d.getTimezoneOffset() * 60);
  }

  //////
  // Format an integer like "04".  
  //////
  function two_digits(num) {
    var ret = String(num);
    if (ret.length < 2) {ret = "0" + ret;}
    return ret;
  }

  //////
  // Format a duration as hours:minutes like "2:04"
  //////
  function format_duration(duration) {
    return Math.floor(duration / 60) + ":" + two_digits(duration % 60);
  }

  //////
  // Format the date like "Sat 7 Dec 2013"
  //////
  function formatDate(t) {
    var d = new Date(t * 1000);
    return $.datepicker.formatDate("D d M yy", d);
  }
  
  //////
  // Format the time like "2:04"
  //////
  function formatTime(t) {
    var d = new Date(t * 1000);
    return d.getHours() + ":" + two_digits(d.getMinutes());
  }
  
  //////
  // Format the date and time like "Sat 7 Dec 2013 2:04"
  //////
  function formatDateTime(t) {
    var d = new Date(t * 1000);
    return $.datepicker.formatDate("D d M yy ", d) + d.getHours() + ":" + two_digits(d.getMinutes());
  }
  
  //////
  // Format the date like "27/01"
  //////
  function formatVShortDate(t) {
    var d = new Date(t * 1000);
    return $.datepicker.formatDate("dd/mm ", d);
  }
  
  //////
  // Escape HTML-specific characters in a string
  //////
  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
  };
  function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  //////
  // Load cookie values en mass.
  //////
  function loadCookies() {
    // Load the cookie.
    var cookie = getCookie("tvdiary_ui");
    if (cookie) {
      var parts = cookie.split("|");
      // Convert the string to boolean, but default to true if it's missing.
      if (parts.length >= 1) {
        including_live = (parts[0] != "false");
      }
      if (parts.length >= 2) {
        programs_sorting = parse2x(parts[1]);
      }
      if (parts.length >= 3) {
        channels_sorting = parse2x(parts[2]);
      }
      if (parts.length >= 4) {
        history_sorting = parse2x(parts[3]);
      }
    }
  }
  function parse2x(valStr) {
    var vals = valStr.split(",");
    var len = vals.length / 2;
    var result = new Array();
    for (var i = 0; i < len; i++) {
      result[i] = new Array();
      result[i][0] = parseInt(vals[i * 2]);
      result[i][1] = parseInt(vals[i * 2 + 1]);
    }
    return result;
  }

  //////
  // Save the cookie values en mass.
  //////
  function saveCookies() {
    var cookie = including_live + "|";
    cookie += fmt2x(programs_sorting) + "|"; // [[1,0],[2,0]];
    cookie += fmt2x(channels_sorting) + "|"; // [[1,0]];
    cookie += fmt2x(history_sorting); // [[4, 1]];
    setCookie("tvdiary_ui", cookie);
  }
  function fmt2x(a) {
    var result = "";
    for (var i = 0; i < a.length; i++) {
      if (i > 0) {
        result += ",";
      }
      result += a[i][0] + "," + a[i][1];
    }
    return result;
  }

  //////
  // Save a cookie for a year.
  //////
  function setCookie(c_name, value) {
    var exdate = new Date();
    exdate.setDate(exdate.getDate() + 365);
    var c_value = escape(value) + "; expires=" + exdate.toUTCString();
    document.cookie = c_name + "=" + c_value;
  }

  //////
  // Read a cookie. Returns a string.
  //////
  function getCookie(c_name) {
    var c_value = document.cookie;
    var c_start = c_value.indexOf(" " + c_name + "=");
    if (c_start == -1) {
      c_start = c_value.indexOf(c_name + "=");
    }
    if (c_start == -1) {
      c_value = null;
    } else {
      c_start = c_value.indexOf("=", c_start) + 1;
      var c_end = c_value.indexOf(";", c_start);
      if (c_end == -1) {
        c_end = c_value.length;
      }
      c_value = unescape(c_value.substring(c_start,c_end));
    }
    return c_value;
  }

  ////////////////////////////////
  // Daily diary panel code
  ////////////////////////////////

  //////
  // Process the button date changes.
  // Because days may be 23, 24 or 25 hours long, and because the datepicker always returns midnight of the
  // selected date, change date by subtracting 20 hours or adding 26 hours. The datepicker takes care of
  // rounding to mignight again itself.
  //////
  function updateDate(direction) {
    if (!(isBusyR || isBusyW)) {
      var currentDate = $('#daily_datepicker').datepicker( "getDate" );
      var newTime = currentDate.getTime();
      if (direction < 0) {
        //newTime -= 86400000;
        newTime -= 79200000; // 22 hours
      } else if (direction > 0) {
        //newTime += 86400000;
        newTime += 93600000; // 26 hours
      } else {
        newTime = today_start * 1000;
      }
      if (newTime >= (min_time * 1000) && newTime <= (max_time * 1000)) {
        currentDate.setTime(newTime);
        $('#daily_datepicker').datepicker("setDate", currentDate);
        // Setting the date doesn't fire the onSelect, so repeat that code here.

        // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
        log_stuff("Simulated datepicker.onSelect(" + new Date(newTime) + ")");
        var chosen = get_tv_day_start(newTime / 1000, true);
        update_daily(chosen);
      }
    }
  }
  
  //////
  // When the date selection changes, request new recorded & watched tables.
  //////
  function update_daily(chosen) {
    daily_start_time = chosen;
    log_stuff("update_daily today_start=" + new Date(today_start * 1000) + ", daily_start_time=" + new Date(daily_start_time * 1000));

    // Main page heading.
    $('#daily_title_date').html( $.datepicker.formatDate("D d MM yy", new Date(daily_start_time * 1000)) );

    // Blank the tables and show progress indicators.
    $('#daily_recorded_inner').html("");
    $('#daily_recorded_spinner').show('fast');
    $('#daily_watched_inner').html("");
    $('#daily_watched_spinner').show('fast');

    // Temporary table headings.
    if (daily_start_time < today_start) {
      $('#daily_recorded_caption').html( "Recorded" );
    } else if (daily_start_time > today_start) {
      $('#daily_recorded_caption').html( "To be recorded" );
    } else {
      $('#daily_recorded_caption').html( "Recorded / To be recorded" );
    }
    $('#daily_watched_caption').html( "Watched" );
    log_stuff("Temp caption now=" + new Date() + ", update_daily(" + new Date(chosen * 1000) + ") daily_start_time=" + new Date(daily_start_time * 1000) + ", today_start=" + new Date(today_start * 1000) + ", set caption to=" + $('#recorded_caption').html());

    var r_url;
    var w_url;
    if (typeof shapshot_time == "undefined") {
      // Pass the browser's time to the web server - helps when clocks aren't synced.
      var now_time = Math.round(new Date().getTime() / 1000);
      r_url = "/tvdiary/day_json.jim?start=" + daily_start_time + "&current_time=" + now_time + "&type=R";
      w_url = "/tvdiary/day_json.jim?start=" + daily_start_time + "&current_time=" + now_time + "&type=W";
    } else {
      var date_filename = $.datepicker.formatDate("yy_mm_dd", new Date(daily_start_time * 1000));
      r_url = "/tvdiary/" + date_filename + "_R.json?nocache";
      w_url = "/tvdiary/" + date_filename + "_W.json?nocache";
    }
    
    // Asynchronously request the watched table data. First, so it may get the DB lock first because it's quicker.
    isBusyW = true;
    $.ajax({
      type: "GET",
      dataType: "json",
      url: w_url,
      success: function(data) {
        if (data.status == "OK" ) {
          update_watched_duration(data);
          $('#daily_watched_inner').html(day_json_to_html(data));
        } else if (data.status == "EMPTY") {
          $('#daily_watched_inner').html("<span class=\"nothing\">Nothing</span>");
        } else {
          $('#daily_watched_inner').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        show_live(including_live);
        bind_dejavu($('#daily_watched_inner'));
        bind_inventory($('#daily_watched_inner'));
        $('#daily_watched_spinner').hide('slow');
        isBusyW = false;
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#daily_watched_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#daily_watched_spinner').hide('slow');
        isBusyW = false;
      }
    });

    // Asynchronously request the recorded table data.
    isBusyR = true;
    $.ajax({
      type: "GET",
      dataType: "json",
      url: r_url,
      success: function(data) {
        if (data.status == "OK" ) {
          update_recorded_duration(data);
          check_overlaps(data);
          $('#daily_recorded_inner').html(day_json_to_html(data));
        } else if (data.status == "EMPTY") {
          $('#daily_recorded_inner').html("<span class=\"nothing\">Nothing</span>");
        } else {
          $('#daily_recorded_inner').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        apply_altrow($('#daily_recorded_inner'));
        bind_dejavu($('#daily_recorded_inner'));
        bind_inventory($('#daily_recorded_inner'));
        $('#daily_recorded_spinner').hide('slow');
        isBusyR = false;
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#daily_recorded_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#daily_recorded_spinner').hide('slow');
        isBusyR = false;
      }
    });
  }

  //////
  // Change whether watched live TV is shown.
  //////
  function show_live(state) {
    including_live = state;
    // Show or hide the rows.
    $( "#daily_watched_inner tr.live_event" ).each(function( index ) {
      if (state) {
        $(this).addClass("visible_event").removeClass("hidden_event");
      } else {
        $(this).addClass("hidden_event").removeClass("visible_event");
      }
    });
    // Update the row colouring.
    apply_altrow( $("#daily_watched_inner") );
    // Adjust how the heading is displayed.
    if (state) {
      $(".live_count").removeClass('live_count_hidden');
    } else {
      $(".live_count").addClass('live_count_hidden');
    }
    // Persist the setting.
    saveCookies()
  }
  
  //////
  // Render table HTML from JSON.
  //////
  function day_json_to_html(data) {
    var html = "";
    html += "<table class=\"events_table\">";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      // typeclass and activeclass CSS.
      var typeclass;
      switch (event.type) {
        case "future":
          typeclass = "future_event";
          break;
        case "record":
          typeclass = "record_event";
          break;
        case "live":
          typeclass = "live_event";
          break;
        case "play":
        default:
          typeclass = "play_event";
          break;
      }
      var activeclass = "";
      if (event.active) {
        activeclass = " active_event";
      }
      var clashclass = "";
      if (event.overlapWarning) {
        clashclass = " clash_event";
      }
      
      html += "<tr class=\"event_row visible_event " + typeclass + activeclass + clashclass+ "\">";

      //
      // Column 1. The actual record or watching time. This is always known.
      //
      html += "<td class=\"event_time\">";
      html += "<div class=\"event_start\">" + formatTime(event.event_start) + "</div>";
      if (event.type == "record" && event.active) {
        html += "<div class=\"event_duration in_progress\">" + event.event_duration + (event.event_duration == 1 ? " min" : " mins") + "</div>";
        html += "<div class=\"event_end in_progress\">" + formatTime(event.event_end) + "</div>";
        html += "<div class=\"event_duration\">&nbsp;</div>";
        html += "<div class=\"event_end\">" + formatTime(event.scheduled_end) + "</div>";
      } else {
        html += "<div class=\"event_duration\">" + event.event_duration + (event.event_duration == 1 ? " min" : " mins") + "</div>";
        html += "<div class=\"event_end\">" + formatTime(event.event_end) + "</div>";
      }
      html += "</td>";

      //
      // Column 2. The channel icon and name.
      //
      html += "<td class=\"tvchannel\">";
      html += "<img src=\"" + event.channel_icon_path + "\" width=50 height=50 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
      html += "<div>" + escapeHtml(event.channel_name) + "</div>";
      html += "</td>";

      //
      // Column 3. There will always be a title. There might not be a synopsis, and there might not be sheduled time and duration.
      //
      html += "<td class=\"event_descr\">";
      html += "<span class=\"tvtitle\">" + escapeHtml(event.title) + "</span>";
      if (event.synopsis != "") {
        html += "<span class=\"tvsynopsis\">" + escapeHtml(event.synopsis) + "</span>";
      }
      if (event.scheduled_start != 0 && event.scheduled_duration != 0) {
        html += "<span class=\"tvschedule\">(" + formatDateTime(event.scheduled_start) + ", " + event.scheduled_duration + (event.scheduled_duration == 1 ? " min" : " mins") + ")</span>";
      }
      html += "</td>"
      
      //
      // Column 4. Icons for unwatched. deleted-unwatched and deja vu icons.
      //
      html += "<td class=\"event_flags\">";
      if (inventory_enabled) {
        if (event.type == "record" && !event.watched) {
          if (!event.available) {
            html += "<img src=\"deleted_unwatched.png\" width=16 height=16 title=\"deleted unwatched\">";
          } else {
            html += "<img src=\"unwatched.png\" width=16 height=16 title=\"unwatched\">";
          }
        }
        if (event.available) {
          html += "<a class=\"inventory\" href=\"#\"><img src=\"available.png\" width=16 height=16 title=\"available\"></a>";
        }
      }
      if (event.repeat_id != -1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_id + "\" href=\"#\"><img src=\"dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      html += "</td>"

      html += "</tr>";
    }
    html += "</table>";
    return $(html);
  }

  //////
  // Update the alternating colour of rows beneath element "el", taking visibility into account.
  //////
  function apply_altrow(el) {
    $("tr.event_row.visible_event", el).each(function(i, tr) {
      if (i % 2) {
        $(tr).addClass('odd').removeClass('even');
      } else {
        $(tr).addClass('even').removeClass('odd');
      }
    });
  }
  
  //////
  // Bind click handler to all deja vu links.
  //////
  function bind_dejavu(el) {
    $('a.dejavu', el).click(function(e) {
      e.preventDefault();

      var prog_id = $(this).attr('prog_id');
      update_history_program(prog_id);
      $("#tvd_tabs").tabs( "option", "active", 2 );
    });
  }

  //////
  // Bind click handler to all inventory links.
  //////
  function bind_inventory(el) {
    $('a.inventory', el).click(function(e) {
      e.preventDefault();

      $("#tvd_tabs").tabs( "option", "active", 3 );
    });
  }


  //////
  // Calculate the duration for one row, constrained by the display range.
  // NB durations are all in minutes, times are in seconds.
  //////
  function duration_within_display_range(range_start, range_end, event_start, event_end) {
    if (event_start < range_start) {
      return Math.round((event_end - range_start) / 60);
    } else if (event_end > range_end) {
      return Math.round((range_end - event_start) / 60);
    } else {
      return Math.round((event_end - event_start) / 60);
    }    
  }

  //////
  // Upon loading the recorded data, count the recorded & scheduled durations & update the heading.
  //////
  function update_recorded_duration(data) {
    var total_recorded = 0;
    var total_scheduled = 0;
    // Nothing rather than total == 0 allows 0:00 at date changeovers.
    var nothing_recorded = true;
    var nothing_scheduled = true;

    // Calculate based on the time range from the table, not what was requested.
    var report_time = data.current_time;
    var report_day_start = get_tv_day_start(report_time, false);

    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      
      if (event.type == "record") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_recorded += constrained_duration;
        nothing_recorded = false;
      } else if (event.type == "future") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_scheduled += constrained_duration;
        nothing_scheduled = false;
      }

      // Add on the remaining time for active recordings
      if (event.type == "record" && event.active) {
        var constrained_duration = 0;
        if (report_time < data.time_start) {
          // Now is before the range - only include time from the range start to scheduled end.
          constrained_duration = Math.ceil((event.scheduled_end - data.time_start) / 60);

        } else if (report_time > data.time_end) {
          // Now is after the range - nothing to include, it's all tomorrow.
          constrained_duration = 0;

        } else if (event.scheduled_end > data.time_end) {
          // Now is near the end of day, within range - include from now to the range end.
          constrained_duration = Math.ceil((data.time_end - report_time) / 60);

        } else {
          // Now must be near the start of day, within range - include from now to the scheduled end.
          constrained_duration = Math.ceil((event.scheduled_end - report_time) / 60);

        }
        log_stuff("update_recorded_duration() recording time for constrained_duration=" + constrained_duration + ", report_time=" + new Date(report_time * 1000) + " scheduled_end=" + new Date(event.scheduled_end * 1000) + ", data.time_start=" + new Date(data.time_start * 1000) + ", data.time_end=" + new Date(data.time_end * 1000));
        // constrained_duration could be -ve if a show is over-running its scheduled end.
        if (constrained_duration > 0) {
          total_scheduled += constrained_duration;
          nothing_scheduled = false;
        }
      }
    }
    
    if (data.time_start < report_day_start) {
      if (nothing_recorded) {
        $('#daily_recorded_caption').html( "Recorded nothing");
      } else {
        $('#daily_recorded_caption').html( "Recorded: " + format_duration(total_recorded));
      }
    } else if (data.time_start > report_day_start) {
      if (nothing_scheduled) {
        $('#daily_recorded_caption').html( "Nothing to be recorded");
      } else {
        $('#daily_recorded_caption').html( "To be recorded: " + format_duration(total_scheduled));
      }
    } else {
      if (nothing_recorded && nothing_scheduled) {
        $('#daily_recorded_caption').html( "Recorded nothing");
      } else if (nothing_recorded) {
        $('#daily_recorded_caption').html( "To be recorded - " + format_duration(total_scheduled));
      } else if (nothing_scheduled) {
        $('#daily_recorded_caption').html( "Recorded: " + format_duration(total_recorded));
      } else {
        $('#daily_recorded_caption').html( "Recorded: " + format_duration(total_recorded) + " / To be recorded: " + format_duration(total_scheduled));
      }
    }
    log_stuff("Recorded caption now=" + new Date() + ", update_recorded_duration() data.time_start=" + new Date(data.time_start*1000) + ", report_day_start=" + new Date(report_day_start*1000) + ", total_recorded=" + total_recorded + ", total_scheduled=" + total_scheduled + ", set caption to=" + $('#recorded_caption').html());
  }
  
  //////
  // Check for too many overlapping scheduled recordings.
  //////
  function check_overlaps(data) {
    // Find overlaps between future events and active recordings.
    var overlaps = [];
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event_a = data.events[i];
      if (event_a.type == "future" || (event_a.type == "record" && event_a.active)) {
        for (var j = i + 1; j < len; j++) {
          var event_b = data.events[j];
          if (event_b.type == "future" || (event_b.type == "record" && event_b.active)) {
            if ((event_b.scheduled_start >= event_a.scheduled_start && event_b.scheduled_start < event_a.scheduled_end)
              || (event_b.scheduled_end >= event_a.scheduled_start && event_b.scheduled_start < event_a.scheduled_end)
              || (event_b.scheduled_start < event_a.scheduled_start && event_b.scheduled_end >= event_a.scheduled_end)) {
              var overlap = {
                index_a: i,
                index_b: j,
                start: Math.max(event_a.scheduled_start, event_b.scheduled_start),
                end:  Math.min(event_a.scheduled_end, event_b.scheduled_end)
              };
              overlaps.push(overlap);
              log_stuff("Overlap: event_a=" + i + " starts " + new Date(event_a.scheduled_start*1000) + " ends " + new Date(event_a.scheduled_end*1000) + " titled " + event_a.title);
              log_stuff("Overlap: event_b=" + j + " starts " + new Date(event_b.scheduled_start*1000) + " ends " + new Date(event_b.scheduled_end*1000) + " titled " + event_b.title);
              log_stuff("Overlap: start=" + new Date(overlap.start*1000) + " end " + new Date(overlap.end*1000));
            }
          }
        }
      }
    }
    
    // Find overlaps between the overlaps. Because any 2 events can only have 1 overlap, this means there are > 2 events overlapping.
    for (var i = 0, len = overlaps.length; i < len; i++) {
      var overlap_a = overlaps[i];
      for (var j = i + 1; j < len; j++) {
        var overlap_b = overlaps[j];
        if ((overlap_b.start >= overlap_a.start && overlap_b.start < overlap_a.end)
          || (overlap_b.end >= overlap_a.start && overlap_b.start < overlap_a.end)
          || (overlap_b.start < overlap_a.start && overlap_b.end >= overlap_a.end)) {
          log_stuff("Overlap: overlap_a start " + new Date(overlap_a.start*1000) + " end " + new Date(overlap_a.end*1000));
          log_stuff("Overlap: overlap_b start " + new Date(overlap_b.start*1000) + " end " + new Date(overlap_b.end*1000));
          log_stuff("Overlaping overlap: start " + new Date(Math.max(overlap_a.start, overlap_b.start)*1000) + " end " + new Date(Math.min(overlap_a.end, overlap_b.end)*1000));
          log_stuff("Affected events: " + overlap_a.index_a + ", " + overlap_a.index_b + ", " + overlap_b.index_a + ", " + overlap_b.index_b);
          // Mark the affected events.
          data.events[overlap_a.index_a].overlapWarning = true;
          data.events[overlap_a.index_b].overlapWarning = true;
          data.events[overlap_b.index_a].overlapWarning = true;
          data.events[overlap_b.index_b].overlapWarning = true;
        }
      }
    }
  }
  
  //////
  // Upon loading the watched data, count the played & live durations & update the heading.
  //////
  function update_watched_duration(data) {
    var total_played = 0;
    var total_live = 0;
    // Nothing rather than total == 0 allows 0:00 at date changeovers.
    var nothing_played = true;
    var nothing_live = true;

    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      
      if (event.type == "play") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_played += constrained_duration;
        nothing_played = false;
      } else if (event.type == "live") {
        var constrained_duration = duration_within_display_range(data.time_start, data.time_end, event.event_start, event.event_end);
        total_live += constrained_duration;
        nothing_live = false;
      }
    }

    var combined_duration = total_played + total_live;
    
    if (nothing_played && nothing_live) {
      $('#daily_watched_caption').html( "Watched nothing");
    } else if (nothing_live) {
      $('#daily_watched_caption').html( "Watched: " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + ")");
    } else if (nothing_played) {
      $('#daily_watched_caption').html( "Watched: " + format_duration(combined_duration) + " (<span class=\"live_count\">Live: " + format_duration(total_live) + "<span>)");
    } else {
      $('#daily_watched_caption').html( "Watched: " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + " / <span class=\"live_count\">Live: " + format_duration(total_live) + "</span>)");
    }
    // Clicking the live time label toggles the display of shows watched live.
    $(".live_count").click(function(){
      show_live(!including_live);
    });
  }


  ////////////////////////////////
  // Monthly summaries panel code
  ////////////////////////////////

  //////
  // Process the buttons in monthly summary.
  //////
  function updateMonth(direction) {
    if (!isBusyM) {
      var selIndex = $('#monthly_month_selector').prop("selectedIndex");
      var maxIndex = $('#monthly_month_selector option').size() - 1;
      var newIndex;
      if (direction == 0) {
        newIndex = maxIndex;
      } else {
        newIndex = selIndex + direction;
      }
      if (newIndex >= 0 && newIndex <= maxIndex && newIndex != selIndex) {
        $('#monthly_month_selector').prop("selectedIndex", newIndex).change();
      }
    }
  }
  
  //////
  // When the date is changed for monthly summaries.
  //////
  function update_monthly(year, month) {
    monthly_year = year;
    monthly_month = month;
    log_stuff("update_month year=" + year + ", month=" + month);

    // Blank the tables and the message footer, and show progress indicators.
    $('#monthly_programs_table tbody').html("");
    $('#monthly_programs_table').trigger("update");
    $('#monthly_programs_caption').html("Programmes");
    $('#monthly_programs_footer').html("");
    $('#monthly_programs_spinner').show('fast');

    $('#monthly_channels_table tbody').html("");
    $('#monthly_channels_table').trigger("update"); 
    $('#monthly_channels_caption').html("Channels");
    $('#monthly_channels_footer').html("");
    $('#monthly_channels_spinner').show('fast');

    var m_url;
    if (typeof shapshot_time == "undefined") {
      m_url = "/tvdiary/monthly_json.jim?year=" + year + "&month=" + month;
    } else {
      m_url = "/tvdiary/" + year + "_" + month + "_M.json?nocache";
    }

    // Asynchronously request the summary tables' data.
    isBusyM = true;
    $('#monthly_month_selector').attr("disabled", "disabled");
    $.ajax({
      type: "GET",
      dataType: "json",
      url: m_url,
      success: function(data) {
        if (data.status == "OK" ) {
          if (data.programs.length > 0) {
            $('#monthly_programs_table tbody').html(monthly_json_to_programs_html(data));
            bind_program_history($('#monthly_programs_table'));
            $("#monthly_programs_table").trigger("update");
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              $("#monthly_programs_table").trigger("sorton",[programs_sorting]); 
            }, 2);
            $('#monthly_programs_caption').html(monthly_json_to_programs_caption(data));
          } else {
            $('#monthly_programs_footer').html("<span class=\"nothing\">No data available</span>");
          }

          if (data.channels.length > 0) {
            $('#monthly_channels_table tbody').html(monthly_json_to_channels_html(data));
            $("#monthly_channels_table").trigger("update"); 
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              $("#monthly_channels_table").trigger("sorton",[channels_sorting]); 
            }, 2);
            // Channels totals should be same as programmes.
            //$('#monthly_channels_caption').html(monthly_json_to_channels_caption(data));
          } else {
            $('#monthly_channels_footer').html("<span class=\"nothing\">No data available</span>");
          }
        } else {
          $('#monthly_programs_footer').html("<span class=\"nothing\">Error: " + data.status + "</span>");
          $('#monthly_channels_footer').html("<span class=\"nothing\">Error: " + data.status + "</span>");
        }
        $('#monthly_programs_spinner').hide('slow');
        $('#monthly_channels_spinner').hide('slow');
        isBusyM = false;
        $('#monthly_month_selector').removeAttr("disabled");
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#monthly_programs_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#monthly_programs_spinner').hide('slow');
        $('#monthly_channels_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#monthly_channels_spinner').hide('slow');
        isBusyM = false;
        $('#monthly_month_selector').removeAttr("disabled");
      }
    });
  }

  //////
  // Render monthly programs table HTML from JSON.
  //////
  function monthly_json_to_programs_html(data) {
    var html = "";
    var len = data.programs.length;
    for (var i = 0; i < len; i++) {
      var program = data.programs[i];

      html += "<tr>";
      html += "<td></td>";
      html += "<td><a class=\"history_link\" title_id=\"" + program.title_id + "\" channel_id=\"" + program.channel_id + "\" href=\"#\">" + escapeHtml(program.title) + "</a></td>";
      html += "<td>";
      if (program.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + program.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(program.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(program.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";
      html += "<td>" + program.recorded_count + "</td>";
      html += "<td>" + program.played_count + "</td>";
      html += "<td>" + program.live_count + "</td>";
      html += "<td>" + program.barely_watched_count + "</td>";
      html += "<td sval=\"" + program.scheduled_duration + "\">" + format_duration(program.scheduled_duration) + "</td>";
      html += "<td sval=\"" + program.recorded_duration +"\">" + format_duration(program.recorded_duration) + "</td>";
      html += "<td sval=\"" + program.played_duration + "\">" + format_duration(program.played_duration) + "</td>";
      html += "<td sval=\"" + program.live_duration + "\">" + format_duration(program.live_duration) + "</td>";
      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render monthly programs table caption from JSON.
  //////
  function monthly_json_to_programs_caption(data) {
    var scheduled_dur = 0;
    var recorded_dur = 0;
    var media_dur = 0;
    var live_dur = 0;
    var len = data.programs.length;
    for (var i = 0; i < len; i++) {
      var program = data.programs[i];

      scheduled_dur += program.scheduled_duration;
      recorded_dur += program.recorded_duration;
      media_dur += program.played_duration;
      live_dur += program.live_duration;
    }
    return "Programmes - Recorded: " + format_duration(recorded_dur) + " - Watched: " + format_duration(media_dur + live_dur) + " (Media: " + format_duration(media_dur) + " / Live: " + format_duration(live_dur) + ")";
  }

  //////
  // Bind click handler to all monthly program history links.
  //////
  function bind_program_history(el) {
    $('a.history_link', el).click(function(e) {
      e.preventDefault();

      var title_id = $(this).attr('title_id');
      var channel_id = $(this).attr('channel_id');
      update_history_title_channel(title_id, channel_id);
      $("#tvd_tabs").tabs( "option", "active", 2 );
    });
  }

  //////
  // Render monthly channels table HTML from JSON.
  //////
  function monthly_json_to_channels_html(data) {
    var html = "";
    var len = data.channels.length;
    for (var i = 0; i < len; i++) {
      var channel = data.channels[i];

      html += "<tr>";
      html += "<td></td>";
      html += "<td>";
      if (channel.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + channel.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(channel.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(channel.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";
      html += "<td>" + channel.recorded_count + "</td>";
      html += "<td>" + channel.played_count + "</td>";
      html += "<td>" + channel.live_count + "</td>";
      html += "<td sval=\"" + channel.recorded_duration + "\">" + format_duration(channel.recorded_duration) + "</td>";
      html += "<td sval=\"" + channel.played_duration + "\">" + format_duration(channel.played_duration) + "</td>";
      html += "<td sval=\"" + channel.live_duration + "\">" + format_duration(channel.live_duration) + "</td>";
      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render monthly channels table caption from JSON.
  //////
  function monthly_json_to_channels_caption(data) {
    var recorded_dur = 0;
    var media_dur = 0;
    var live_dur = 0;
    var len = data.channels.length;
    for (var i = 0; i < len; i++) {
      var channel = data.channels[i];

      recorded_dur += channel.recorded_duration;
      media_dur += channel.played_duration;
      live_dur += channel.live_duration;
    }
    return "Channels - Recorded: " + format_duration(recorded_dur) + " - Watched: " + format_duration(media_dur + live_dur) + " (Media: " + format_duration(media_dur) + " / Live: " + format_duration(live_dur) + ")";
  }

  ////////////////////////////////
  // History panel code
  ////////////////////////////////

  //////
  // Request display of history by program_id, for repeats.
  //////
  function update_history_program(prog_id) {
    $('#history_prompt').html("You may have seen this programme already in the past. Searching for activities with the same title and synopsis.");

    if (typeof shapshot_time == "undefined") {
      var url = '/tvdiary/history_json.jim?program_id=' + prog_id;
    } else {
      var url = '/tvdiary/history_dummy.json?nocache';
    }
    update_history(url, true);
  }

  //////
  // Request display of history by title_id & channel_id from monthly summary.
  //////
  function update_history_title_channel(title_id, channel_id) {
    $('#history_prompt').html("Searching for activities with the same title on the same channel.");

    if (typeof shapshot_time == "undefined") {
      var url = '/tvdiary/history_json.jim?title_id=' + title_id + '&channel_id=' + channel_id;
    } else {
      var url = '/tvdiary/history_dummy.json?nocache';
    }
    update_history(url, true);
  }

  //////
  // Request display of history using the text fields.
  //////
  function searchHistory() {
    $('#history_prompt').html("Enter all or part of the title, synopsis or channel name, then search for the history of that programme.");

    var title = $('#history_search_title').val();
    var synopsis = $('#history_search_synopsis').val();
    var channel = $('#history_search_channel').val();
    var title_op = $('#history_search_op_title').val();
    var synopsis_op = $('#history_search_op_synopsis').val();
    var channel_op = $('#history_search_op_channel').val();

    if (typeof shapshot_time == "undefined") {
      var url = '/tvdiary/history_json.jim?title=' + encodeURIComponent(title) + '&channel=' + encodeURIComponent(channel) + '&synopsis=' + encodeURIComponent(synopsis) + '&title_op=' + title_op + '&channel_op=' + channel_op + '&synopsis_op=' + synopsis_op;
    } else {
      var url = '/tvdiary/history_dummy.json?nocache';
    }
    update_history(url, false);
  }

  //////
  // Request display of history by url.
  //////
  function update_history(url, clearCriteria) {
    // Blank the table and the message footer, and show progress indicators.
    if (clearCriteria) {
      $('#history_search_title').val("");
      $('#history_search_synopsis').val("");
      $('#history_search_channel').val("");
      $('#history_search_op_title').val("E");
      $('#history_search_op_synopsis').val("E");
      $('#history_search_op_channel').val("E");
    }

    $('#history_results_table tbody').html("");
    $('#history_results_table').trigger("update");
    $('#history_results_caption').html("Programme events");
    $('#history_results_footer').html("");
    $('#history_results_spinner').show('fast');

    // Asynchronously request the history tables' data.
    isBusyH = true;
    $('#history_search_button').attr("disabled", "disabled");
    $.ajax({
      type: "GET",
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK" ) {
          $('#history_search_title').val(data.title ? data.title : "");
          $('#history_search_synopsis').val(data.synopsis ? data.synopsis : "");
          $('#history_search_channel').val(data.channel_name ? data.channel_name : "");
          if (data.events.length > 0) {
            $('#history_results_table tbody').html(history_json_to_html(data));
            $('#history_results_caption').html(history_json_to_caption(data));
            $("#history_results_table").trigger("update");
            // Must delay sorting because the tablesorter introduces a delay before it acts on the "update".
            setTimeout(function(){
              $("#history_results_table").trigger("sorton",[history_sorting]); 
            }, 2);
          } else {
            $('#history_results_footer').html("<span class=\"nothing\">No matches found</span>");
          }
        } else {
          $('#history_results_footer').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
        }
        $('#history_results_spinner').hide('slow');
        isBusyH = false;
        $('#history_search_button').removeAttr("disabled");
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#history_results_footer').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#history_results_spinner').hide('slow');
        isBusyH = false;
        $('#history_search_button').removeAttr("disabled");
      }
    });
  }

  //////
  // Render history HTML from JSON.
  //////
  function history_json_to_html(data) {
    var html = "";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      var type_icon;
      switch (event.type) {
        case "future":
        case "record":
          type_icon = "/images/745_1_11_Video_1REC.png";
          break;
        case "live":
          type_icon = "/tvdiary/tvmast.png";
          break;
        case "play":
        default:
          type_icon = "/images/745_1_10_Video_2Live.png";
          break;
      }
      var duration = Math.round((event.end - event.start + 30) / 60);

      html += "<tr>";

      html += "<td class=\"history_type\">";
      html += "<img src=\"" + type_icon + "\" width=22 height=22 alt=\"" + event.type + "\" title=\"" + event.type + "\"/>";
      html += "</td>";

      html += "<td class=\"history_channel\">";
      if (event.channel_name != "") {
        html += "<div>";
        html += "<img src=\"" + event.channel_icon_path + "\" width=20 height=20 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
        html += "<span>" + escapeHtml(event.channel_name) + "</span>";
        html += "</div>";
      }
      html += "</td>";

      html += "<td class=\"history_title\">";
      html += "<div>" + escapeHtml(event.title) + "</div>";
      html += "</td>";

      html += "<td class=\"history_synopsis\">";
      html += "<div>" + escapeHtml(event.synopsis) + "</div>";
      html += "</td>";

      html += "<td class=\"history_datetime\" sval=\"" + event.start + "\">";
      html += formatDateTime(event.start);
      html += "</td>";
      
      html += "<td class=\"history_duration\" sval=\"" + duration + "\">";
      html += duration + (duration == 1 ? " min" : " mins");
      html += "</td>";

      html += "</tr>";
    }
    return $(html);
  }

  //////
  // Render results caption from JSON.
  //////
  function history_json_to_caption(data) {
    var recorded_dur = 0;
    var recorded_count = 0;
    var media_dur = 0;
    var media_count = 0;
    var live_dur = 0;
    var live_count = 0;
    var program_ids = [];
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      //var duration = Math.round((event.end - event.start + 30) / 60);
      var duration = event.end - event.start;
      switch (event.type) {
        case "record":
          recorded_dur += duration;
          recorded_count += 1;
          break;
        case "live":
          live_dur += duration;
          live_count += 1;
          break;
        case "play":
          media_dur += duration;
          media_count += 1;
          break;
        default:
          break;
      }
      if (program_ids.indexOf(event.program_id) == -1) {
        program_ids.push(event.program_id);
      }
    }
    recorded_dur = Math.round((recorded_dur + 29) / 60);
    media_dur = Math.round((media_dur + 29) / 60);
    live_dur = Math.round((live_dur + 29) / 60);
    caption = "Recorded: " + format_duration(recorded_dur) + " - Watched: " + format_duration(media_dur + live_dur) + " (Media: " + format_duration(media_dur) + " / Live: " + format_duration(live_dur) + ") - ";
    caption += program_ids.length + (program_ids.length == 1 ? " programme - " : " programmes - ");
    caption += data.events.length + (data.events.length == 1 ? " event" : " events");
    return caption;
  }

  ////////////////////////////////
  // Inventory panel code
  ////////////////////////////////

  //////
  // Update the contents of the inventory panel.
  //////
  function update_inventory() {
    if (typeof shapshot_time == "undefined") {
      var url = '/tvdiary/inventory_json.jim?modified=' + inventory_modified;
    } else {
      var url = '/tvdiary/inventory_dummy.json?nocache';
    }
    $.ajax({
      type: "GET",
      dataType: "json",
      url: url,
      success: function(data) {
        if (data.status == "OK" && data.events.length > 0) {
          $('#inventory_inner').html(inventory_json_to_html(data));
          bind_dejavu($('#inventory_inner'));
          inventory_modified = data.modified;
          $('#inventory_caption').html("[HDD] My Video - " + format_duration(inventory_json_to_total_duration(data)));
        } else if (data.status == "UNMODIFIED") {
          // NOP - the latest data is already visible.
        } else if (data.status == "EMPTY" || data.events.length == 0) {
          $('#inventory_inner').html("<span class=\"nothing\">Nothing</span>");
          $('#inventory_caption').html("[HDD] My Video");
        } else {
          $('#inventory_inner').html("<span class=\"nothing\">Error: " + escapeHtml(data.status) + "</span>");
          $('#inventory_caption').html("[HDD] My Video");
        }
        $('#inventory_spinner').hide('slow');
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#inventory_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#inventory_caption').html("[HDD] My Video");
        $('#inventory_spinner').hide('slow');
      }
    });
  }

  //////
  // Render inventory HTML from JSON.
  //////
  function inventory_json_to_html(data) {
    var cur_dir = "";
    var count_in_dir = 0;
    var html = "";
    html += "<table class=\"events_table\">";
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];

      if (event.directory != cur_dir) {
        html += "<tr class=\"inventory_dir\">";
        html += "<td colspan=\"4\" class=\"inventory_dir\">";
        html += escapeHtml(event.directory);
        html += "</td>";
        html += "</tr>";
        cur_dir = event.directory;
        count_in_dir = 1;
      }

      html += "<tr class=\"event_row " + (count_in_dir % 2 ? "odd" : "even" ) + "\">";
      count_in_dir += 1;

      //
      // Column 1. The channel icon and name.
      //
      html += "<td class=\"tvchannel\">";
      html += "<img src=\"" + event.channel_icon_path + "\" width=50 height=50 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
      html += "<div>" + escapeHtml(event.channel_name) + "</div>";
      html += "</td>";

      // Column 2 - the thumbnail.
      html += "<td class=\"tvchannel\">";
      if (event.has_thumbnail) {
        if (typeof shapshot_time == "undefined") {
          html += "<img class=\"bmp\" src=\"/browse/bmp.jim?file=" + encodeURIComponent(event.directory + "/" + event.filename) + "\">";
        } else {
          html += "<img class=\"bmp\" src=\"" + encodeURIComponent(event.filename) + ".png\">";
        }
      }
      html += "</td>";
      //
      // Column 3. Title, times and synopsis.
      //
      html += "<td class=\"event_descr\">";
      html += "<span class=\"tvtitle\">" + escapeHtml(event.title) + "</span>";
      html += "<br><span class=\"\">" + formatTime(event.event_start) + "&nbsp;&nbsp;" + formatVShortDate(event.event_start) + "&nbsp;&nbsp;" + event.event_duration + (event.event_duration == 1 ? "min" : "mins") + "</span>";
      if (event.synopsis != "") {
        html += "<span class=\"tvsynopsis\">" + escapeHtml(event.synopsis) + "</span>";
      }
      if (event.scheduled_start != 0 && event.scheduled_duration != 0) {
        html += "<span class=\"tvschedule\">(" + formatDateTime(event.scheduled_start) + ", " + event.scheduled_duration + (event.scheduled_duration == 1 ? " min" : " mins") + ")</span>";
      }
      html += "</td>"

      //
      // Column 4. Icons for deja vu icon.
      //
      html += "<td class=\"event_flags\">";
      if (!event.watched) {
        html += "<img src=\"unwatched.png\" width=16 height=16 title=\"unwatched\">";
      }
      if (event.repeat_id != -1) {
        html += " <a class=\"dejavu\" prog_id=\"" + event.repeat_id + "\" href=\"#\"><img src=\"dejavu.png\" width=16 height=16 title=\"d&eacute;j&agrave; vu?\"></a>";
      }
      html += "</td>"

      html += "</tr>";
    }
    html += "</table>";
    return $(html);
  }

  //////
  // Calculate the total duration of the videos from JSON.
  //////
  function inventory_json_to_total_duration(data) {
    var total_duration = 0;
    for (var i = 0, len = data.events.length; i < len; i++) {
      var event = data.events[i];
      total_duration += event.event_duration;
    }
    return total_duration;
  }

  ////////////////////////////////
  ////////////////////////////////

  // Last thing to do when the page loads: show today's details.
  update_daily(today_start);
});
// End of $(document).ready(function() {})
