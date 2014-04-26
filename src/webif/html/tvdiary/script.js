/*
 * TV Diary main display page scripts.
 * Author: Martin Wink, 2013-2014.
 */

// calendar_params.js/jim must be included prior to this.
// day_start seconds offset to the start of the TV day. Relative to local time.
// min_time time of the earliest available information. In UTC.
// max_time time of the latest available information. In UTC.
// shapshot_time defined only for a published snapshot.
//

// Declare globals

// Today's calendar date start.
var today_start;

// Whether live broadcasts are to be displayed. Toggled on and off.
var including_live = true;

// Start time for the displayed details, with the day_start offset included. Changed by the datepicker. In UTC.
var request_start;

// While awaiting Ajax responses.
var isBusyR = false;
var isBusyW = false;

//////
// Logging wrapper.
//////
function log_stuff(x) {
  /*console.log(x);*/
  /*$.get("/tvdiary/jslog.jim?msg=" + encodeURI(x));*/
}

//////
// Page loaded - start work.
//////
$(document).ready(function() {
  if (typeof shapshot_time == "undefined") {
    today_start = get_tv_day_start(new Date().getTime() / 1000, false);
  } else {
  //  today_start = Math.floor((shapshot_time - day_start) / 86400) * 86400 + day_start;
    today_start = get_tv_day_start(shapshot_time, false);
  }

  // Initialize the to-top scroller.
  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  $("#slideset1").show();
  $("#slideset2").hide();

  $("#inventory_return").click(function() {
    $("#slideset1").show("fade");
    $("#slideset2").hide("fade");
    $('#inventory_inner').html("");
    $('#inventory_spinner').show();
  });
  
  // Initialize the datepicker.
  $('#datepicker').datepicker({
          firstDay: 1,
          dateFormat: '@',  //@=ms since 01/01/1970.
          minDate: new Date(min_time * 1000),
          maxDate: new Date(max_time * 1000),
          defaultDate: new Date(today_start * 1000),
          onSelect: function(val, inst) {
                  if (isBusyR || isBusyW) {
                    log_stuff("UI is busy - not changing the date to " + new Date(Number(val)) + " - restoring " + new Date(request_start*1000) +".");
                    $('#datepicker').datepicker("setDate", new Date(request_start * 1000));
                  } else {
                    // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
                    log_stuff("datepicker.onSelect(" + new Date(Number(val)) + ")");
                    var chosen = get_tv_day_start(Number(val) / 1000, true);
                    request_update(chosen);
                  }
          }
  });
  log_stuff("Initialized the default datepicker time to " + new Date(today_start * 1000));

  // Load the cookie. Convert the string to boolean, but default to true if it's missing.
  // Set the initial checked state before initializing the iphoneStyle checkbox.
  including_live = getCookie("tvdiary_live_tv");
  including_live = (including_live != "false");

  $('#prev_day').button()
    .click(function() {
      updateDate(-1);
    });
  $('#today').button()
    .click(function() {
      updateDate(0);
    });
  $('#next_day').button()
    .click(function() {
      updateDate(+1);
    });

  // Prepare reusable dialogue.
  var $dejavu_dialog = $('#dejavu_dialog').dialog({
    title: "D\xe9j\xe0 vu? You might have seen this show before...",
    modal: true, autoOpen: false,
    height: 500, width: 600,
    show: 'scale', hide: 'fade',
    draggable: false, resizable: false,
    buttons: { "Close" : function() {
      $(this).dialog('close');
    } },
    close: function(e,u) {
      $('#dejavu_dialog').empty().html('<img src="/img/loading.gif" alt="loading">');
    }
  });
  
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
  // Process the button date changes.
  // Because days may be 23, 24 or 25 hours long, and because the datepicker always returns midnight of the
  // selected date, change date by subtracting 20 hours or adding 26 hours. The datepicker takes care of
  // rounding to mignight again itself.
  //////
  function updateDate(direction) {
    if (!(isBusyR || isBusyW)) {
      var currentDate = $('#datepicker').datepicker( "getDate" );
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
        $('#datepicker').datepicker("setDate", currentDate);
        // Setting the date doesn't fire the onSelect, so repeat that code here.

        // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
        log_stuff("Simulated datepicker.onSelect(" + new Date(newTime) + ")");
        var chosen = get_tv_day_start(newTime / 1000, true);
        request_update(chosen);
      }
    }
  }
  
  //////
  // Change whether watched live TV is shown.
  //////
  function show_live(state) {
    including_live = state;
    // Show or hide the rows.
    $( "#watched_inner tr.live_event" ).each(function( index ) {
      if (state) {
        $(this).addClass("visible_event").removeClass("hidden_event");
      } else {
        $(this).addClass("hidden_event").removeClass("visible_event");
      }
    });
    // Update the row colouring.
    apply_altrow( $("#watched_inner") );
    // Adjust how the heading is displayed.
    if (state) {
      $(".live_count").removeClass('live_count_hidden');
    } else {
      $(".live_count").addClass('live_count_hidden');
    }
    // Persist the setting.
    setCookie("tvdiary_live_tv", including_live);
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
      html += "<img src=\"" + event.channel_icon_path + "\" width=50 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
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
      if (typeof shapshot_time == "undefined") {
        var url = '/tvdiary/dejavu_json.jim?program_id=' + prog_id;
      } else {
        var url = '/tvdiary/dejavu_dummy.json?nocache';
      }
      $.ajax({
        type: "GET",
        dataType: "json",
        url: url,
        success: function(data) {
          if (data.status == "OK" ) {
            $dejavu_dialog.html(dejavu_json_to_html(data));
          } else {
            $dejavu_dialog.html("<span class=\"nothing\">Error: " + data.status + "</span>");
          }
        },
        error: function(_, _, e) {
          log_stuff("ajax error " + e);
          $dejavu_dialog.html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        }
      });

      $dejavu_dialog.dialog('open');
    });
  }

  //////
  // Render dialog HTML from JSON.
  //////
  function dejavu_json_to_html(data) {
    var html = "";
    html += "<div class=\"dv_heading\">";
    html += "<span class=\"tvtitle\">" + escapeHtml(data.title) + "</span>";
    if (data.synopsis != "") {
      html += "<span class=\"tvsynopsis\">" + escapeHtml(data.synopsis) + "</span>";
    }
    html += "</div>";
    html += "<table class=\"dv_table\">";
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

      html += "<tr class=\"dv_row\">";

      html += "<td class=\"dv_type\">";
      html += "<img src=\"" + type_icon + "\" width=22 height=22 alt=\"" + event.type + "\" title=\"" + event.type + "\"/>";
      html += "</td>";

      html += "<td class=\"dv_date\">";
      html += formatDateTime(event.start);
      html += "</td>";

      html += "<td class=\"dv_duration\">";
      html += duration + (duration == 1 ? " min" : " mins");
      html += "</td>";

      html += "<td class=\"dv_channel\">";
      html += "<div>" + escapeHtml(event.channel_name) + "</div>";
      html += "</td>";

      html += "</tr>";
    }
    html += "</table>";
    return $(html);
  }
  
  //////
  // Bind click handler to all inventory links.
  //////
  function bind_inventory(el) {
    $('a.inventory', el).click(function(e) {
      e.preventDefault();

      if (typeof shapshot_time == "undefined") {
        var url = '/tvdiary/inventory_json.jim';
      } else {
        var url = '/tvdiary/inventory_dummy.json?nocache';
      }
      $.ajax({
        type: "GET",
        dataType: "json",
        url: url,
        success: function(data) {
          if (data.status == "OK" ) {
            $('#inventory_inner').html(inventory_json_to_html(data));
            bind_dejavu($('#inventory_inner'));
          } else if (data.status == "EMPTY" || data.events.length == 0) {
            $('#inventory_inner').html("<span class=\"nothing\">Nothing</span>");
          } else {
            $('#inventory_inner').html("<span class=\"nothing\">Error: " + data.status + "</span>");
          }
          $('#inventory_spinner').hide('slow');
        },
        error: function(_, _, e) {
          log_stuff("ajax error " + e);
          $('#inventory_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
          $('#inventory_spinner').hide('slow');
        }
      });

      //$("#slideset1").hide('slide', {direction: 'left'}, 1000);
      //$("#slideset2").show('slide', {direction: 'left'}, 1000);
      $("#slideset1").hide("fade");
      $("#slideset2").show("fade");
    });
  }

  //////
  // Render dialog HTML from JSON.
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
      html += "<img src=\"" + event.channel_icon_path + "\" width=50 alt=\"" + escapeHtml(event.channel_name) + "\"/>";
      html += "<div>" + escapeHtml(event.channel_name) + "</div>";
      html += "</td>";

      // Column 2 - the thumbnail.
      html += "<td class=\"tvchannel\">";
      if (event.has_thumbnail) {
        if (typeof shapshot_time == "undefined") {
          html += "<img class=\"bmp\" src=\"/browse/bmp.jim?file=" + encodeURI(event.directory + "/" + event.filename) + "\">";
        } else {
          html += "<img class=\"bmp\" src=\"" + encodeURI(event.filename) + ".png\">";
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
  // Format the date and time like "Sat 7 Dec 2013 2:04"
  //////
  function formatDateTime(t) {
    var d = new Date(t * 1000);
    d.setTime(d.getTime() - d.getTimezoneOffset() * 60000);
    return $.datepicker.formatDate("D d M yy ", d) + formatTime(t);
  }
  
  //////
  // Format the date like "27/01"
  //////
  function formatVShortDate(t) {
    var d = new Date(t * 1000);
    d.setTime(d.getTime() - d.getTimezoneOffset() * 60000);
    return $.datepicker.formatDate("dd/mm ", d);
  }
  
  //////
  // Format the time like "2:04"
  //////
  function formatTime(t) {
    var d = new Date(t * 1000);
    t = (d.getTime() - d.getTimezoneOffset() * 60000) / 1000;
    return format_duration(Math.floor((t % 86400) / 60));
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
        $('#recorded_caption').html( "Recorded nothing");
      } else {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded));
      }
    } else if (data.time_start > report_day_start) {
      if (nothing_scheduled) {
        $('#recorded_caption').html( "Nothing to be recorded");
      } else {
        $('#recorded_caption').html( "To be recorded - " + format_duration(total_scheduled));
      }
    } else {
      if (nothing_recorded && nothing_scheduled) {
        $('#recorded_caption').html( "Recorded nothing");
      } else if (nothing_recorded) {
        $('#recorded_caption').html( "To be recorded - " + format_duration(total_scheduled));
      } else if (nothing_scheduled) {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded));
      } else {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded) + " / To be recorded - " + format_duration(total_scheduled));
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
      $('#watched_caption').html( "Watched nothing");
    } else if (nothing_live) {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + ")");
    } else if (nothing_played) {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (<span class=\"live_count\">Live: " + format_duration(total_live) + "<span>)");
    } else {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + " / <span class=\"live_count\">Live: " + format_duration(total_live) + "</span>)");
    }
    // Clicking the live time label toggles the display of shows watched live.
    $(".live_count").click(function(){
      show_live(!including_live);
    });
  }

  //////
  // When the date selection changes, request new recorded & watched tables.
  //////
  function request_update(chosen) {
    request_start = chosen;
    log_stuff("request_update today_start=" + new Date(today_start * 1000) + ", request_start=" + new Date(request_start * 1000));

    // Main page heading.
    $('#title_date').html( " - " + $.datepicker.formatDate("D d MM yy", new Date(request_start * 1000)) );

    // Blank the tables and show progress indicators.
    $('#recorded_inner').html("");
    $('#recorded_spinner').show('fast');
    $('#watched_inner').html("");
    $('#watched_spinner').show('fast');

    // Temporary table headings.
    if (request_start < today_start) {
      $('#recorded_caption').html( "Recorded" );
    } else if (request_start > today_start) {
      $('#recorded_caption').html( "To be recorded" );
    } else {
      $('#recorded_caption').html( "Recorded / To be recorded" );
    }
    $('#watched_caption').html( "Watched" );
    log_stuff("Temp caption now=" + new Date() + ", request_update(" + new Date(chosen * 1000) + ") request_start=" + new Date(request_start * 1000) + ", today_start=" + new Date(today_start * 1000) + ", set caption to=" + $('#recorded_caption').html());

    var r_url;
    var w_url;
    if (typeof shapshot_time == "undefined") {
      // Pass the browser's time to the web server - helps when clocks aren't synced.
      var now_time = Math.round(new Date().getTime() / 1000);
      r_url = "/tvdiary/day_json.jim?start=" + request_start + "&current_time=" + now_time + "&type=R";
      w_url = "/tvdiary/day_json.jim?start=" + request_start + "&current_time=" + now_time + "&type=W";
    } else {
      var date_filename = $.datepicker.formatDate("yy_mm_dd", new Date(request_start * 1000));
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
          $('#watched_inner').html(day_json_to_html(data));
        } else if (data.status == "EMPTY") {
          $('#watched_inner').html("<span class=\"nothing\">Nothing</span>");
        } else {
          $('#watched_inner').html("<span class=\"nothing\">Error: " + data.status + "</span>");
        }
        show_live(including_live);
        bind_dejavu($('#watched_inner'));
        bind_inventory($('#watched_inner'));
        $('#watched_spinner').hide('slow');
        isBusyW = false;
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#watched_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#watched_spinner').hide('slow');
        isBusyW = false;
      }
    });

    // Asynchronously request the recorded table data.
    isBusyR = true;
    $.ajax({
      type: "GET",
      dataType: "json",
      // For standalone page only
      url: r_url,
      success: function(data) {
        if (data.status == "OK" ) {
          update_recorded_duration(data);
          check_overlaps(data);
          $('#recorded_inner').html(day_json_to_html(data));
        } else if (data.status == "EMPTY") {
          $('#recorded_inner').html("<span class=\"nothing\">Nothing</span>");
        } else {
          $('#recorded_inner').html("<span class=\"nothing\">Error: " + data.status + "</span>");
        }
        apply_altrow($('#recorded_inner'));
        bind_dejavu($('#recorded_inner'));
        bind_inventory($('#recorded_inner'));
        $('#recorded_spinner').hide('slow');
        isBusyR = false;
      },
      error: function(_, _, e) {
        log_stuff("ajax error " + e);
        $('#recorded_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#recorded_spinner').hide('slow');
        isBusyR = false;
      }
    });
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

  // Last thing to do when the page loads: show today's details.
  request_update(today_start);
});
